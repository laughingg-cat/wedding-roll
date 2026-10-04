begin;
select plan(37);

select ok(relrowsecurity, 'events has RLS') from pg_class where oid = 'public.events'::regclass;
select ok(relrowsecurity, 'guest_sessions has RLS') from pg_class where oid = 'public.guest_sessions'::regclass;
select ok(relrowsecurity, 'photos has RLS') from pg_class where oid = 'public.photos'::regclass;
select ok(relrowsecurity, 'likes has RLS') from pg_class where oid = 'public.likes'::regclass;
select ok(relrowsecurity, 'winner_selections has RLS') from pg_class where oid = 'public.winner_selections'::regclass;
select ok(relrowsecurity, 'event_admins has RLS') from pg_class where oid = 'public.event_admins'::regclass;
select ok(relrowsecurity, 'rate_limit_buckets has RLS') from pg_class where oid = 'public.rate_limit_buckets'::regclass;
select has_trigger('public', 'photos', 'photos_touch_updated_at', 'photo updates advance the moderation sync timestamp');

select ok(not has_table_privilege('anon', 'public.events', 'select,insert,update,delete'), 'anon cannot access events');
select ok(not has_table_privilege('authenticated', 'public.events', 'select,insert,update,delete'), 'authenticated cannot access events');
select ok(not has_table_privilege('anon', 'public.guest_sessions', 'select,insert,update,delete'), 'anon cannot access sessions');
select ok(not has_table_privilege('authenticated', 'public.guest_sessions', 'select,insert,update,delete'), 'authenticated cannot access sessions');
select ok(not has_table_privilege('anon', 'public.photos', 'select,insert,update,delete'), 'anon cannot access photos');
select ok(not has_table_privilege('authenticated', 'public.photos', 'select,insert,update,delete'), 'authenticated cannot access photos');
select ok(not has_table_privilege('anon', 'public.likes', 'select,insert,update,delete'), 'anon cannot access likes');
select ok(not has_table_privilege('authenticated', 'public.likes', 'select,insert,update,delete'), 'authenticated cannot access likes');
select ok(not has_table_privilege('anon', 'public.winner_selections', 'select,insert,update,delete'), 'anon cannot access winners');
select ok(not has_table_privilege('authenticated', 'public.winner_selections', 'select,insert,update,delete'), 'authenticated cannot access winners');
select ok(not has_table_privilege('anon', 'public.event_admins', 'select,insert,update,delete'), 'anon cannot access admins');
select ok(not has_table_privilege('authenticated', 'public.event_admins', 'select,insert,update,delete'), 'authenticated cannot access admins');
select ok(not has_table_privilege('anon', 'public.rate_limit_buckets', 'select,insert,update,delete'), 'anon cannot access rate limits');
select ok(not has_table_privilege('authenticated', 'public.rate_limit_buckets', 'select,insert,update,delete'), 'authenticated cannot access rate limits');

select is(public, false, 'temporary bucket is private') from storage.buckets where id = 'wedding-temp';
select is(public, false, 'photo bucket is private') from storage.buckets where id = 'wedding-photos';
select is(file_size_limit, 6291456::bigint, 'temporary bucket is limited to 6 MiB') from storage.buckets where id = 'wedding-temp';
select is(file_size_limit, 6291456::bigint, 'photo bucket is limited to 6 MiB') from storage.buckets where id = 'wedding-photos';

select ok(not has_function_privilege('anon', 'public.reserve_photo(uuid,uuid,public.photo_preset,text,timestamptz)', 'execute'), 'anon cannot reserve directly');
select ok(not has_function_privilege('authenticated', 'public.reserve_photo(uuid,uuid,public.photo_preset,text,timestamptz)', 'execute'), 'authenticated cannot reserve directly');
select ok(not has_function_privilege('anon', 'public.toggle_photo_like(uuid,uuid,boolean,timestamptz)', 'execute'), 'anon cannot like directly');
select ok(not has_function_privilege('authenticated', 'public.toggle_photo_like(uuid,uuid,boolean,timestamptz)', 'execute'), 'authenticated cannot like directly');
select ok(has_function_privilege('service_role', 'public.reserve_photo(uuid,uuid,public.photo_preset,text,timestamptz)', 'execute'), 'service role can reserve');
select ok(has_function_privilege('service_role', 'public.toggle_photo_like(uuid,uuid,boolean,timestamptz)', 'execute'), 'service role can like');
select ok(not has_function_privilege('authenticated', 'public.rotate_event_access(uuid,text,timestamptz)', 'execute'), 'authenticated cannot rotate access directly');
select ok(has_function_privilege('service_role', 'public.rotate_event_access(uuid,text,timestamptz)', 'execute'), 'service role can rotate access');
select ok(not has_function_privilege('authenticated', 'public.admin_event_photos(uuid)', 'execute'), 'authenticated cannot read admin rankings directly');
select ok(has_function_privilege('service_role', 'public.admin_event_photos(uuid)', 'execute'), 'service role can read admin rankings');

insert into public.events(id,name,timezone,access_token_hash,upload_starts_at,upload_ends_at,voting_starts_at,voting_ends_at,retention_at)
values ('00000000-0000-0000-0000-000000000001','test','UTC',repeat('a',64),now()-interval '1 hour',now()+interval '1 hour',now()-interval '1 hour',now()+interval '1 hour',now()+interval '721 hours');
insert into public.guest_sessions(id,event_id,display_name,consent_version,token_hash,expires_at) values
('00000000-0000-0000-0001-000000000001','00000000-0000-0000-0000-000000000001','A','v1',repeat('b',64),now()+interval '30 days'),
('00000000-0000-0000-0001-000000000002','00000000-0000-0000-0000-000000000001','B','v1',repeat('c',64),now()+interval '30 days'),
('00000000-0000-0000-0001-000000000003','00000000-0000-0000-0000-000000000001','C','v1',repeat('d',64),now()+interval '30 days'),
('00000000-0000-0000-0001-000000000004','00000000-0000-0000-0000-000000000001','D','v1',repeat('e',64),now()+interval '30 days');
insert into public.photos(id,event_id,guest_session_id,preset,status,temp_path,reservation_expires_at,completed_at) values
('00000000-0000-0000-0002-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','original','visible','test/1.jpg',now()+interval '10 minutes',now()),
('00000000-0000-0000-0002-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000002','original','visible','test/2.jpg',now()+interval '10 minutes',now()),
('00000000-0000-0000-0002-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000003','original','visible','test/3.jpg',now()+interval '10 minutes',now()),
('00000000-0000-0000-0002-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','original','visible','test/4.jpg',now()+interval '10 minutes',now());
insert into public.likes(photo_id,guest_session_id) values
('00000000-0000-0000-0002-000000000001','00000000-0000-0000-0001-000000000002'),
('00000000-0000-0000-0002-000000000001','00000000-0000-0000-0001-000000000003'),
('00000000-0000-0000-0002-000000000001','00000000-0000-0000-0001-000000000004'),
('00000000-0000-0000-0002-000000000002','00000000-0000-0000-0001-000000000001'),
('00000000-0000-0000-0002-000000000002','00000000-0000-0000-0001-000000000003'),
('00000000-0000-0000-0002-000000000003','00000000-0000-0000-0001-000000000001'),
('00000000-0000-0000-0002-000000000003','00000000-0000-0000-0001-000000000002'),
('00000000-0000-0000-0002-000000000004','00000000-0000-0000-0001-000000000001');
select is(
  array(select rank from public.admin_event_photos('00000000-0000-0000-0000-000000000001') order by id),
  array[1,2,2,4]::bigint[],
  'admin rankings use competition ranks for ties'
);

select * from finish();
rollback;
