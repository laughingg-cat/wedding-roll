# Our Wedding Roll

A private, mobile-first disposable-camera web app for one wedding. Guests enter through a bearer QR link, choose a film-inspired preset, take up to 12 JPEG photos, and vote for other guests' photos. Organizers moderate the album, manage upload and voting windows, choose winners, and export original plus filtered files.

The named presets are unofficial visual interpretations and are not affiliated with Kodak, Fujifilm, CineStill, or Ilford.

## Architecture

- Next.js App Router on Vercel; all database and ordinary Storage access is server-mediated.
- Supabase Postgres, Auth, and two private Storage buckets (`wedding-temp`, `wedding-photos`).
- Guests use random opaque cookies whose hashes are stored in Postgres. Organizers use pre-created Supabase Auth users and email magic links.
- Browser uploads use a server-issued signed URL for one exact random temporary path. Sharp validates, normalizes, strips metadata, and renders the authoritative preset on the server.
- Gallery media and organizer downloads are authenticated before redirecting to a 60-second signed URL.
- Current Storage objects are deleted by the authenticated Vercel retention job before the corresponding database event is deleted.

## Local setup

1. Install Node.js 20+ and the Supabase CLI. Run `npm install`.
2. Copy `.env.example` to `.env.local` and replace every placeholder. Never use a secret/service key in a `NEXT_PUBLIC_*` variable.
3. Run `supabase start`, then `supabase db reset`. Run `supabase test db` to verify RLS, grants, function access, and private buckets.
4. In Supabase Auth, create one or two organizer users before event setup. Configure the production Site URL and `/auth/callback` redirect URL. Disable public sign-up in the Auth settings.
5. Run `npm run dev`.

For a same-Wi-Fi phone smoke test, run `npm run dev -- --hostname 0.0.0.0`, then open `http://<laptop-lan-ip>:3000/join/<event-token>` on the phone. LAN HTTP supports entry, consent, native photo capture, uploads, gallery, and likes. Browser `getUserMedia` camera permission requires an HTTPS tunnel or deployed preview; use the built-in native-camera fallback for local HTTP testing.

Create the one production event and its printable QR:

```bash
npm run setup:event -- \
  --name "Taylor & Sam" \
  --timezone "Asia/Tokyo" \
  --upload-start "2027-08-24T08:00:00+09:00" \
  --upload-end "2027-08-24T23:00:00+09:00" \
  --voting-start "2027-08-24T08:00:00+09:00" \
  --voting-end "2027-08-25T12:00:00+09:00" \
  --admin-emails "organizer@example.com" \
  --qr "wedding-qr.svg"
```

The command prints the bearer join URL only once and creates a high-error-correction SVG. Keep both private until invitations are sent. Anyone who receives a forwarded link can enter; clearing browser data creates a new friendly quota. Unique codes or verified guest accounts are outside this MVP.

Retention is enforced by the database at exactly 30 × 24 hours after `upload-end` (an absolute instant parsed from the supplied timezone offset). It is not a calendar-month calculation, is unaffected by daylight-saving changes, and cannot be extended by the setup command.

## Required environment

See `.env.example`. `SUPABASE_SECRET_KEY`, `RATE_LIMIT_SECRET`, and `CRON_SECRET` are server-only. In Vercel, set `CRON_SECRET` so scheduled requests carry `Authorization: Bearer <CRON_SECRET>`.

## Operations

- Organizer dashboard: `/organizer`
- Full resumable local export: `npm run export:event -- <event-uuid> ./exports/wedding`
- Verify the generated `checksums.sha256.csv` before deletion.
- Emergency rotation pauses uploads, revokes every guest cookie, and produces a replacement bearer link. Replace the QR destination before resuming uploads.
- The daily retention endpoint removes Storage objects through the Storage API, then cascades database deletion. Do not delete rows directly from the `storage` schema; that can orphan billed objects.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
supabase test db
npm audit --omit=dev
```

Before printing the QR, test current iPhone Safari and Android Chrome, in-app-browser fallback, offline pending recovery, all five presets, moderation, winner reveal, emergency rotation, full export, and retention on a disposable event. Rehearse 300 sessions with a 60-user burst against the paid production-sized project. Target at least 99% successful backend requests, p95 gallery/like latency under one second, and 95% of photos visible within 20 seconds on a stable 10 Mbps connection.

The checked-in k6 admission/gallery/like burst is run with `BASE_URL=https://photos.example.com EVENT_TOKEN=<temporary-test-event-token> k6 run tests/load/wedding-burst.js`. Run the upload/finalization rehearsal with real phone-sized JPEG fixtures from the deployment environment so it exercises Supabase Storage as well as Vercel Functions.

At least two weeks before the wedding, upgrade hosting, confirm at least 20 GB of usable image capacity plus headroom, finish the load rehearsal, configure the custom domain, and freeze the QR destination. Two days before, run the real-device smoke test and freeze code except for a rehearsed rollback or emergency configuration change.

## Security notes

All exposed tables have RLS enabled while `anon` and `authenticated` grants are revoked. The browser cannot list buckets, select database rows, choose Storage paths, access clean originals, or call security-definer functions. Mutations enforce same-origin requests and per-session/IP-derived rate limits. Security headers disable framing, indexing, referrers, MIME sniffing, microphone and geolocation; camera permission is scoped to this origin. Application code must not log names, tokens, request bodies, or signed URLs.
