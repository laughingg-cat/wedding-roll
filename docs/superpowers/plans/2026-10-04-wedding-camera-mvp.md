# Wedding Disposable Camera MVP Implementation Plan

Build the approved English-only wedding camera app using Next.js, Supabase, private storage, server-rendered film presets, a twelve-shot guest quota, a live gallery, likes without self-voting, organizer moderation, exports, and thirty-day retention.

Implementation order: foundation and domain contracts; guest access; camera and local recovery; upload processing; gallery and voting; organizer controls; export and cleanup; security, device, browser, and load verification.

Global constraints: one event, up to 300 guests and 60 concurrent upload flows, five fixed presets, QR bearer access, opaque guest sessions, private storage, organizer-only clean captures, free development tiers, and a required paid-capacity rehearsal before production.

