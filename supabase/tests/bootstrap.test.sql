begin;
select plan(18);

-- Validation happens before any state mutation or auth lookup.
select throws_ok(
  $$select public.bootstrap_event(
    array['00000000-0000-0000-0000-000000000001'::uuid],
    'Test', 'UTC', 'not-hex', now(), now() + interval '1 hour',
    now(), now() + interval '1 hour', 12)$$,
  'P0001', 'invalid_access_token_hash',
  'rejects a malformed access token hash'
);

select throws_ok(
  $$select public.bootstrap_event(
    array['00000000-0000-0000-0000-000000000001'::uuid],
    'Test', 'UTC', repeat('a', 64), now(), now() + interval '1 hour',
    now(), now() + interval '1 hour', 0)$$,
  'P0001', 'invalid_shot_limit',
  'rejects an out-of-range shot limit'
);

select throws_ok(
  $$select public.bootstrap_event(
    array['00000000-0000-0000-0000-000000000001'::uuid],
    'Test', 'UTC', repeat('a', 64), now(), now() - interval '1 hour',
    now(), now() + interval '1 hour', 12)$$,
  'P0001', 'invalid_upload_window',
  'rejects an inverted upload window'
);

select throws_ok(
  $$select public.bootstrap_event(
    array['00000000-0000-0000-0000-000000000001'::uuid],
    'Test', 'UTC', repeat('a', 64), now(), now() + interval '1 hour',
    now(), now() - interval '1 hour', 12)$$,
  'P0001', 'invalid_voting_window',
  'rejects an inverted voting window'
);

select throws_ok(
  $$select public.bootstrap_event(
    array[]::uuid[], 'Test', 'UTC', repeat('a', 64), now(), now() + interval '1 hour',
    now(), now() + interval '1 hour', 12)$$,
  'P0001', 'invalid_organizers',
  'rejects an empty organizer list'
);

select throws_ok(
  $$select public.bootstrap_event(
    array['00000000-0000-0000-0000-000000000001'::uuid],
    'Test', 'UTC', repeat('a', 64), now(), now() + interval '1 hour',
    now(), now() + interval '1 hour', 12)$$,
  'P0001', 'unknown_organizer',
  'rejects an organizer with no auth account'
);

select is(
  (select count(*) from public.events),
  0::bigint,
  'a failed bootstrap leaves no event behind'
);

-- update_event_settings recomputes retention from the new upload window.
insert into public.events (
  id, name, timezone, access_token_hash,
  upload_starts_at, upload_ends_at, voting_starts_at, voting_ends_at, retention_at
) values (
  '00000000-0000-0000-0000-000000000001', 'Old', 'UTC', repeat('a', 64),
  '2027-08-24T08:00:00+00', '2027-08-24T23:00:00+00',
  '2027-08-24T08:00:00+00', '2027-08-26T00:00:00+00',
  '2027-09-23T23:00:00+00'
);

select lives_ok(
  $$select public.update_event_settings(
    '00000000-0000-0000-0000-000000000001', 'New', 'Asia/Tokyo',
    '2027-08-24T08:00:00+00', '2027-08-25T00:00:00+00',
    '2027-08-24T08:00:00+00', '2027-08-26T00:00:00+00', 20)$$,
  'edits event settings'
);

select is(
  (select retention_at from public.events where id = '00000000-0000-0000-0000-000000000001'),
  '2027-09-24T00:00:00+00'::timestamptz,
  'retention recomputes to exactly 720 hours after the new upload end'
);

select throws_ok(
  $$select public.update_event_settings(
    '00000000-0000-0000-0000-000000000001', 'New', 'UTC',
    '2027-08-24T08:00:00+00', '2027-08-24T07:00:00+00',
    '2027-08-24T08:00:00+00', '2027-08-26T00:00:00+00', 20)$$,
  'P0001', 'invalid_upload_window',
  'rejects an inverted window on update'
);

-- Landing invariants are enforced in the database.
select lives_ok(
  $$insert into public.event_landing_photo_drafts (id, event_id, storage_path, position)
    select
      ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
      '00000000-0000-0000-0000-000000000001',
      'draft/' || g::text || '.jpg',
      g
    from generate_series(0, 23) as g$$,
  '24 landing drafts are allowed'
);

select throws_ok(
  $$insert into public.event_landing_photo_drafts (id, event_id, storage_path, position)
    values ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000001', 'draft/99.jpg', 99)$$,
  'P0001', 'landing_limit_reached',
  'the 25th landing draft is rejected'
);

select lives_ok(
  $$select public.set_landing_draft_cover(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005')$$,
  'sets a landing cover'
);

select is(
  (select count(*) from public.event_landing_photo_drafts where event_id = '00000000-0000-0000-0000-000000000001' and is_cover),
  1::bigint,
  'exactly one draft is the cover'
);

select lives_ok(
  $$select public.reorder_landing_drafts(
    '00000000-0000-0000-0000-000000000001',
    (select array_agg(id order by position desc) from public.event_landing_photo_drafts
      where event_id = '00000000-0000-0000-0000-000000000001'))$$,
  'reorders drafts in one statement'
);

select is(
  (select position from public.event_landing_photo_drafts where id = '00000000-0000-0000-0000-000000000000'),
  23,
  'the first draft moved to the end after a reversal'
);

select throws_ok(
  $$select public.reorder_landing_drafts(
    '00000000-0000-0000-0000-000000000001',
    array['00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid])$$,
  'P0001', 'duplicate_reorder_id',
  'rejects duplicate ids in a reorder'
);

select throws_ok(
  $$select public.reorder_landing_drafts(
    '00000000-0000-0000-0000-000000000001',
    array['00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000099'::uuid])$$,
  'P0001', 'invalid_reorder',
  'rejects a reorder that is not an exact permutation'
);

select * from finish();
rollback;
