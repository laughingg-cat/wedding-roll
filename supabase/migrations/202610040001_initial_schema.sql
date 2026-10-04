create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create type public.photo_preset as enum (
  'original', 'portra_400', 'quicksnap', 'cinestill_800t', 'hp5_plus'
);

create type public.photo_status as enum (
  'reserved', 'processing', 'visible', 'hidden', 'failed', 'expired'
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null,
  access_token_hash text not null unique check (access_token_hash ~ '^[a-f0-9]{64}$'),
  upload_starts_at timestamptz not null,
  upload_ends_at timestamptz not null,
  voting_starts_at timestamptz not null,
  voting_ends_at timestamptz not null,
  uploads_paused boolean not null default false,
  voting_paused boolean not null default false,
  shot_limit smallint not null default 12 check (shot_limit between 1 and 50),
  retention_at timestamptz not null,
  winners_revealed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint events_upload_window check (upload_ends_at > upload_starts_at),
  constraint events_voting_window check (voting_ends_at > voting_starts_at),
  constraint events_retention_exact check (retention_at - upload_ends_at = interval '720 hours')
);

create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  consent_version text not null,
  consented_at timestamptz not null default now(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  completed_photo_count smallint not null default 0 check (completed_photo_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_session_id uuid not null references public.guest_sessions(id) on delete cascade,
  preset public.photo_preset not null,
  status public.photo_status not null default 'reserved',
  temp_path text not null unique,
  original_path text unique,
  filtered_path text unique,
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  byte_size integer check (byte_size is null or byte_size between 1 and 6291456),
  reservation_expires_at timestamptz not null,
  processing_started_at timestamptz,
  completed_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid references auth.users(id) on delete set null,
  hide_reason text check (hide_reason is null or char_length(hide_reason) <= 240),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.likes (
  photo_id uuid not null references public.photos(id) on delete cascade,
  guest_session_id uuid not null references public.guest_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, guest_session_id)
);

create table public.winner_selections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  placement smallint not null check (placement between 1 and 100),
  award_label text not null check (char_length(award_label) between 1 and 80),
  selected_by uuid not null references auth.users(id) on delete restrict,
  selected_at timestamptz not null default now(),
  unique (event_id, photo_id, award_label)
);

create table public.event_admins (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.rate_limit_buckets (
  bucket_key text primary key,
  action text not null,
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count >= 0),
  expires_at timestamptz not null
);

create index guest_sessions_event_idx on public.guest_sessions(event_id, created_at desc);
create index guest_sessions_token_active_idx on public.guest_sessions(token_hash) where revoked_at is null;
create index photos_event_feed_idx on public.photos(event_id, completed_at desc, id desc) where status = 'visible';
create index photos_session_active_idx on public.photos(guest_session_id, status, reservation_expires_at);
create index likes_photo_idx on public.likes(photo_id);
create index rate_limit_expiry_idx on public.rate_limit_buckets(expires_at);

create or replace function public.touch_photo_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
create trigger photos_touch_updated_at before update on public.photos
for each row execute function public.touch_photo_updated_at();

alter table public.events enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.photos enable row level security;
alter table public.likes enable row level security;
alter table public.winner_selections enable row level security;
alter table public.event_admins enable row level security;
alter table public.rate_limit_buckets enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant all on public.events, public.guest_sessions, public.photos, public.likes,
  public.winner_selections, public.event_admins, public.rate_limit_buckets to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('wedding-temp', 'wedding-temp', false, 6291456, array['image/jpeg']),
  ('wedding-photos', 'wedding-photos', false, 6291456, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.reserve_photo(
  p_event_id uuid,
  p_guest_session_id uuid,
  p_preset public.photo_preset,
  p_temp_path text,
  p_now timestamptz default now()
) returns public.photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_session public.guest_sessions;
  v_photo public.photos;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;

  select * into v_session
  from public.guest_sessions
  where id = p_guest_session_id and event_id = p_event_id
  for update;
  if not found or v_session.revoked_at is not null or v_session.expires_at <= p_now then
    raise exception 'invalid_session' using errcode = 'P0001';
  end if;
  if v_event.uploads_paused or p_now < v_event.upload_starts_at or p_now >= v_event.upload_ends_at then
    raise exception 'uploads_closed' using errcode = 'P0001';
  end if;
  if v_session.completed_photo_count >= v_event.shot_limit then
    raise exception 'shot_limit_reached' using errcode = 'P0001';
  end if;

  update public.photos
  set status = 'expired', updated_at = p_now
  where guest_session_id = p_guest_session_id
    and status = 'reserved'
    and reservation_expires_at <= p_now;

  if exists (
    select 1 from public.photos
    where guest_session_id = p_guest_session_id
      and status in ('reserved', 'processing')
      and reservation_expires_at > p_now
  ) then
    raise exception 'pending_capture_exists' using errcode = 'P0001';
  end if;

  insert into public.photos (
    event_id, guest_session_id, preset, temp_path, reservation_expires_at
  ) values (
    p_event_id, p_guest_session_id, p_preset, p_temp_path, p_now + interval '10 minutes'
  ) returning * into v_photo;

  return v_photo;
end;
$$;

create or replace function public.claim_photo_processing(
  p_photo_id uuid,
  p_guest_session_id uuid,
  p_now timestamptz default now()
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_photo public.photos;
begin
  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found or v_photo.guest_session_id <> p_guest_session_id then
    raise exception 'photo_not_found' using errcode = 'P0001';
  end if;
  if v_photo.status in ('visible', 'hidden') then return 'complete'; end if;
  if v_photo.status = 'processing' then
    if v_photo.processing_started_at >= p_now - interval '2 minutes' then return 'busy'; end if;
    update public.photos set processing_started_at = p_now, updated_at = p_now where id = p_photo_id;
    return 'claimed';
  end if;
  if v_photo.status <> 'reserved' or v_photo.reservation_expires_at <= p_now then
    update public.photos set status = 'expired', updated_at = p_now where id = p_photo_id;
    return 'expired';
  end if;
  update public.photos
  set status = 'processing', processing_started_at = p_now, updated_at = p_now
  where id = p_photo_id;
  return 'claimed';
end;
$$;

create or replace function public.complete_photo(
  p_photo_id uuid,
  p_original_path text,
  p_filtered_path text,
  p_width integer,
  p_height integer,
  p_byte_size integer,
  p_now timestamptz default now()
) returns public.photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.photos;
  v_session public.guest_sessions;
  v_event public.events;
begin
  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found then raise exception 'photo_not_found' using errcode = 'P0001'; end if;
  if v_photo.status in ('visible', 'hidden') then return v_photo; end if;
  if v_photo.status <> 'processing' then raise exception 'photo_not_processing' using errcode = 'P0001'; end if;

  select * into v_session from public.guest_sessions where id = v_photo.guest_session_id for update;
  select * into v_event from public.events where id = v_photo.event_id;
  if v_session.completed_photo_count >= v_event.shot_limit then
    raise exception 'shot_limit_reached' using errcode = 'P0001';
  end if;

  update public.photos set
    status = 'visible', original_path = p_original_path, filtered_path = p_filtered_path,
    width = p_width, height = p_height, byte_size = p_byte_size,
    completed_at = p_now, updated_at = p_now
  where id = p_photo_id returning * into v_photo;

  update public.guest_sessions
  set completed_photo_count = completed_photo_count + 1
  where id = v_photo.guest_session_id;
  return v_photo;
end;
$$;

create or replace function public.toggle_photo_like(
  p_photo_id uuid,
  p_guest_session_id uuid,
  p_like boolean,
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.photos;
  v_event public.events;
  v_session public.guest_sessions;
  v_count integer;
begin
  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found or v_photo.status <> 'visible' then raise exception 'photo_unavailable' using errcode = 'P0001'; end if;
  select * into v_event from public.events where id = v_photo.event_id;
  select * into v_session from public.guest_sessions
    where id = p_guest_session_id and event_id = v_photo.event_id;
  if not found or v_session.revoked_at is not null or v_session.expires_at <= p_now then
    raise exception 'invalid_session' using errcode = 'P0001';
  end if;
  if v_event.voting_paused or p_now < v_event.voting_starts_at or p_now >= v_event.voting_ends_at then
    raise exception 'voting_closed' using errcode = 'P0001';
  end if;
  if v_photo.guest_session_id = p_guest_session_id then raise exception 'self_vote' using errcode = 'P0001'; end if;

  if p_like then
    insert into public.likes(photo_id, guest_session_id)
    values (p_photo_id, p_guest_session_id) on conflict do nothing;
  else
    delete from public.likes where photo_id = p_photo_id and guest_session_id = p_guest_session_id;
  end if;
  select count(*)::integer into v_count from public.likes where photo_id = p_photo_id;
  return v_count;
end;
$$;

revoke all on function public.reserve_photo(uuid, uuid, public.photo_preset, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_photo_processing(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_photo(uuid, text, text, integer, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.toggle_photo_like(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_photo(uuid, uuid, public.photo_preset, text, timestamptz) to service_role;
grant execute on function public.claim_photo_processing(uuid, uuid, timestamptz) to service_role;
grant execute on function public.complete_photo(uuid, text, text, integer, integer, integer, timestamptz) to service_role;
grant execute on function public.toggle_photo_like(uuid, uuid, boolean, timestamptz) to service_role;

create or replace function public.rotate_event_access(
  p_event_id uuid,
  p_access_token_hash text,
  p_now timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_access_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_access_token_hash' using errcode = 'P0001';
  end if;
  update public.events
  set access_token_hash = p_access_token_hash, uploads_paused = true
  where id = p_event_id;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  update public.guest_sessions set revoked_at = p_now
  where event_id = p_event_id and revoked_at is null;
end;
$$;

revoke all on function public.rotate_event_access(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.rotate_event_access(uuid, text, timestamptz) to service_role;

create or replace function public.admin_event_photos(p_event_id uuid)
returns table (
  id uuid,
  status public.photo_status,
  completed_at timestamptz,
  author text,
  like_count bigint,
  rank bigint,
  tied boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with photo_counts as (
    select p.id, p.status, p.completed_at, g.display_name as author, count(l.photo_id)::bigint as like_count
    from public.photos p
    join public.guest_sessions g on g.id = p.guest_session_id
    left join public.likes l on l.photo_id = p.id
    where p.event_id = p_event_id and p.status in ('visible', 'hidden')
    group by p.id, p.status, p.completed_at, g.display_name
  ), visible_ranked as (
    select pc.id,
      rank() over (order by pc.like_count desc)::bigint as rank,
      (count(*) over (partition by pc.like_count) > 1) as tied
    from photo_counts pc where pc.status = 'visible'
  )
  select pc.id, pc.status, pc.completed_at, pc.author, pc.like_count,
    coalesce(vr.rank, 0)::bigint, coalesce(vr.tied, false)
  from photo_counts pc left join visible_ranked vr on vr.id = pc.id
  order by coalesce(vr.rank, 9223372036854775807), pc.like_count desc, pc.id;
$$;

revoke all on function public.admin_event_photos(uuid) from public, anon, authenticated;
grant execute on function public.admin_event_photos(uuid) to service_role;

create or replace function public.check_rate_limit(
  p_bucket_key text,
  p_action text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default now()
) returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare v_bucket public.rate_limit_buckets;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit' using errcode = 'P0001';
  end if;

  insert into public.rate_limit_buckets(bucket_key, action, window_started_at, hit_count, expires_at)
  values (p_bucket_key, p_action, p_now, 1, p_now + make_interval(secs => p_window_seconds))
  on conflict (bucket_key) do update set
    action = excluded.action,
    window_started_at = case
      when public.rate_limit_buckets.expires_at <= p_now then p_now
      else public.rate_limit_buckets.window_started_at
    end,
    hit_count = case
      when public.rate_limit_buckets.expires_at <= p_now then 1
      else public.rate_limit_buckets.hit_count + 1
    end,
    expires_at = case
      when public.rate_limit_buckets.expires_at <= p_now then p_now + make_interval(secs => p_window_seconds)
      else public.rate_limit_buckets.expires_at
    end
  returning * into v_bucket;

  return query select
    v_bucket.hit_count <= p_limit,
    greatest(0, p_limit - v_bucket.hit_count),
    v_bucket.expires_at;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer, timestamptz) to service_role;

create or replace function public.cleanup_expired_wedding_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rate_limit_buckets where expires_at <= now();
  update public.photos set status = 'expired', updated_at = now()
  where status = 'reserved' and reservation_expires_at <= now();
end;
$$;

revoke all on function public.cleanup_expired_wedding_data() from public, anon, authenticated;
grant execute on function public.cleanup_expired_wedding_data() to service_role;

select cron.schedule(
  'cleanup-expired-wedding-data',
  '17 3 * * *',
  $$select public.cleanup_expired_wedding_data();$$
)
where not exists (select 1 from cron.job where jobname = 'cleanup-expired-wedding-data');
