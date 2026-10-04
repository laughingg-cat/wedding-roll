-- Organizer self-serve setup and landing-page photo manager.
-- Introduces a single-event bootstrap path, editable event settings, and a
-- draft/published model for the guest welcome (landing) photos. All tables
-- remain RLS-protected; only service_role (server code) touches them.

-- Landing photos: the published set guests actually see.
create table public.event_landing_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  storage_path text not null unique,
  position integer not null check (position >= 0),
  is_cover boolean not null default false,
  alt_text text not null default '' check (char_length(alt_text) <= 200),
  visible boolean not null default true,
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  byte_size integer check (byte_size is null or byte_size between 1 and 6291456),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Landing photo drafts: the organizer's staging area, hidden until published.
create table public.event_landing_photo_drafts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  storage_path text not null unique,
  position integer not null check (position >= 0),
  is_cover boolean not null default false,
  alt_text text not null default '' check (char_length(alt_text) <= 200),
  visible boolean not null default true,
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  byte_size integer check (byte_size is null or byte_size between 1 and 6291456),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_landing_photos_event_idx on public.event_landing_photos(event_id, position);
create index event_landing_drafts_event_idx on public.event_landing_photo_drafts(event_id, position);

-- At most one cover per event, and stable ordering, enforced in the database so
-- concurrent organizers cannot corrupt the landing page.
create unique index event_landing_photos_single_cover on public.event_landing_photos(event_id) where is_cover;
create unique index event_landing_drafts_single_cover on public.event_landing_photo_drafts(event_id) where is_cover;
alter table public.event_landing_photos
  add constraint event_landing_photos_event_pos unique (event_id, position) deferrable initially deferred;
alter table public.event_landing_photo_drafts
  add constraint event_landing_drafts_event_pos unique (event_id, position) deferrable initially deferred;

alter table public.event_landing_photos enable row level security;
alter table public.event_landing_photo_drafts enable row level security;

revoke all on public.event_landing_photos from anon, authenticated;
revoke all on public.event_landing_photo_drafts from anon, authenticated;
grant all on public.event_landing_photos, public.event_landing_photo_drafts to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wedding-landing', 'wedding-landing', false, 6291456, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Transactional first-event bootstrap. Rejects a second event and links the
-- supplied auth users as organizers. Called only through service_role.
create or replace function public.bootstrap_event(
  p_user_ids uuid[],
  p_name text,
  p_timezone text,
  p_access_token_hash text,
  p_upload_starts_at timestamptz,
  p_upload_ends_at timestamptz,
  p_voting_starts_at timestamptz,
  p_voting_ends_at timestamptz,
  p_shot_limit integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_user_id uuid;
  v_count integer;
begin
  if p_access_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_access_token_hash' using errcode = 'P0001';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 or char_length(p_name) > 120 then
    raise exception 'invalid_event_name' using errcode = 'P0001';
  end if;
  if p_timezone is null or char_length(btrim(p_timezone)) = 0 or char_length(p_timezone) > 64 then
    raise exception 'invalid_timezone' using errcode = 'P0001';
  end if;
  if p_shot_limit is null or p_shot_limit not between 1 and 50 then
    raise exception 'invalid_shot_limit' using errcode = 'P0001';
  end if;
  if p_upload_ends_at <= p_upload_starts_at then
    raise exception 'invalid_upload_window' using errcode = 'P0001';
  end if;
  if p_voting_ends_at <= p_voting_starts_at then
    raise exception 'invalid_voting_window' using errcode = 'P0001';
  end if;
  if p_user_ids is null or array_length(p_user_ids, 1) is null
     or array_length(p_user_ids, 1) < 1 or array_length(p_user_ids, 1) > 2 then
    raise exception 'invalid_organizers' using errcode = 'P0001';
  end if;

  -- Serialize concurrent setup attempts against the singleton event.
  perform pg_advisory_xact_lock(hashtext('bootstrap_wedding_event'));

  select count(*) into v_count from public.events;
  if v_count > 0 then
    raise exception 'event_already_exists' using errcode = 'P0001';
  end if;

  insert into public.events (
    name, timezone, access_token_hash,
    upload_starts_at, upload_ends_at, voting_starts_at, voting_ends_at,
    shot_limit, retention_at
  ) values (
    btrim(p_name), btrim(p_timezone), p_access_token_hash,
    p_upload_starts_at, p_upload_ends_at, p_voting_starts_at, p_voting_ends_at,
    p_shot_limit, p_upload_ends_at + interval '720 hours'
  ) returning id into v_event_id;

  foreach v_user_id in array p_user_ids loop
    if v_user_id is null or (select count(*) from auth.users where id = v_user_id) = 0 then
      raise exception 'unknown_organizer' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.event_admins where user_id = v_user_id) then
      raise exception 'organizer_already_linked' using errcode = 'P0001';
    end if;
    insert into public.event_admins (event_id, user_id) values (v_event_id, v_user_id);
  end loop;

  return v_event_id;
end;
$$;

revoke all on function public.bootstrap_event(uuid[], text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.bootstrap_event(uuid[], text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, integer) to service_role;

-- Editable event settings. Recomputes retention so the 720-hour constraint
-- stays satisfied whenever the upload window moves.
create or replace function public.update_event_settings(
  p_event_id uuid,
  p_name text,
  p_timezone text,
  p_upload_starts_at timestamptz,
  p_upload_ends_at timestamptz,
  p_voting_starts_at timestamptz,
  p_voting_ends_at timestamptz,
  p_shot_limit integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if p_name is null or char_length(btrim(p_name)) = 0 or char_length(p_name) > 120 then
    raise exception 'invalid_event_name' using errcode = 'P0001';
  end if;
  if p_timezone is null or char_length(btrim(p_timezone)) = 0 or char_length(p_timezone) > 64 then
    raise exception 'invalid_timezone' using errcode = 'P0001';
  end if;
  if p_shot_limit is null or p_shot_limit not between 1 and 50 then
    raise exception 'invalid_shot_limit' using errcode = 'P0001';
  end if;
  if p_upload_ends_at <= p_upload_starts_at then
    raise exception 'invalid_upload_window' using errcode = 'P0001';
  end if;
  if p_voting_ends_at <= p_voting_starts_at then
    raise exception 'invalid_voting_window' using errcode = 'P0001';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if v_event.id is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;

  update public.events set
    name = btrim(p_name),
    timezone = btrim(p_timezone),
    upload_starts_at = p_upload_starts_at,
    upload_ends_at = p_upload_ends_at,
    voting_starts_at = p_voting_starts_at,
    voting_ends_at = p_voting_ends_at,
    shot_limit = p_shot_limit,
    retention_at = p_upload_ends_at + interval '720 hours'
  where id = p_event_id;

  -- Keep existing guest sessions in sync with the (possibly extended) retention
  -- deadline so guests who joined earlier do not lose access early.
  update public.guest_sessions
  set expires_at = p_upload_ends_at + interval '720 hours'
  where event_id = p_event_id and revoked_at is null;
end;
$$;

revoke all on function public.update_event_settings(uuid, text, text, timestamptz, timestamptz, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.update_event_settings(uuid, text, text, timestamptz, timestamptz, timestamptz, timestamptz, integer) to service_role;

-- Enforces the 24-photo landing limit at the database, serialized per event so
-- concurrent uploads cannot race past the cap.
create or replace function public.enforce_landing_draft_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.event_id::text));
  select count(*) into v_count
  from public.event_landing_photo_drafts
  where event_id = new.event_id;
  if v_count >= 24 then
    raise exception 'landing_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists landing_draft_limit on public.event_landing_photo_drafts;
create trigger landing_draft_limit
before insert on public.event_landing_photo_drafts
for each row execute function public.enforce_landing_draft_limit();

-- Atomically clears the previous cover and sets the new one after confirming the
-- requested draft exists (single transaction, protected by the unique index).
create or replace function public.set_landing_draft_cover(
  p_event_id uuid,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.event_landing_photo_drafts where event_id = p_event_id and id = p_id) then
    raise exception 'draft_not_found' using errcode = 'P0001';
  end if;
  update public.event_landing_photo_drafts set is_cover = false where event_id = p_event_id;
  update public.event_landing_photo_drafts set is_cover = true where event_id = p_event_id and id = p_id;
end;
$$;

revoke all on function public.set_landing_draft_cover(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_landing_draft_cover(uuid, uuid) to service_role;

-- Reorders drafts in one statement so the deferred position constraint holds.
create or replace function public.reorder_landing_drafts(
  p_event_id uuid,
  p_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_total integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'invalid_reorder' using errcode = 'P0001';
  end if;

  -- The submitted ids must be an exact permutation of the event's drafts:
  -- no duplicates, no foreign ids, and none missing.
  select count(*) into v_count from (select distinct id from unnest(p_ids) as id) s;
  if v_count <> array_length(p_ids, 1) then
    raise exception 'duplicate_reorder_id' using errcode = 'P0001';
  end if;

  select count(*) into v_total
  from public.event_landing_photo_drafts
  where event_id = p_event_id;
  if v_total <> array_length(p_ids, 1) then
    raise exception 'invalid_reorder' using errcode = 'P0001';
  end if;

  select count(*) into v_count
  from public.event_landing_photo_drafts
  where event_id = p_event_id and id = any(p_ids);
  if v_count <> array_length(p_ids, 1) then
    raise exception 'invalid_reorder' using errcode = 'P0001';
  end if;

  update public.event_landing_photo_drafts d
  set position = u.ord - 1
  from unnest(p_ids) with ordinality as u(id, ord)
  where d.id = u.id and d.event_id = p_event_id;
end;
$$;

revoke all on function public.reorder_landing_drafts(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_landing_drafts(uuid, uuid[]) to service_role;

-- Transactionally swaps the published landing set (delete + insert in one
-- transaction). Storage objects are handled by the caller outside this swap.
create or replace function public.replace_published_landing(
  p_event_id uuid,
  p_photos jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then
    raise exception 'invalid_photos' using errcode = 'P0001';
  end if;
  delete from public.event_landing_photos where event_id = p_event_id;
  insert into public.event_landing_photos (
    id, event_id, storage_path, position, is_cover, alt_text, visible, width, height, byte_size
  )
  select
    (p.value->>'id')::uuid,
    p_event_id,
    p.value->>'storage_path',
    (p.value->>'position')::integer,
    coalesce((p.value->>'is_cover')::boolean, false),
    coalesce(p.value->>'alt_text', ''),
    coalesce((p.value->>'visible')::boolean, true),
    nullif(p.value->>'width', 'null')::integer,
    nullif(p.value->>'height', 'null')::integer,
    nullif(p.value->>'byte_size', 'null')::integer
  from jsonb_array_elements(p_photos) p;
end;
$$;

revoke all on function public.replace_published_landing(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_published_landing(uuid, jsonb) to service_role;
