import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import path from "node:path";

import { createOpaqueToken, hashOpaqueToken } from "../src/features/auth/session-token";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]?.replace(/^--/, "");
  const value = process.argv[index + 1];
  if (key && value) args.set(key, value);
}
const required = (name: string) => { const value = args.get(name); if (!value) throw new Error(`Missing --${name}`); return value; };
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
if (!url || !secret || !siteUrl) throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY, and NEXT_PUBLIC_SITE_URL are required");
const client = createClient(url, secret, { auth: { persistSession: false } });
const token = createOpaqueToken(16);
const adminEmails = required("admin-emails").split(",").map((item) => item.trim().toLowerCase());
if (adminEmails.length > 2) throw new Error("This MVP supports up to two organizers");
const { data: users, error: usersError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (usersError) throw usersError;
const adminUsers = adminEmails.map((email) => {
  const user = users.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) throw new Error(`Create the Supabase Auth user before setup: ${email}`);
  return user;
});
const record = {
  name: required("name"), timezone: required("timezone"), access_token_hash: hashOpaqueToken(token),
  upload_starts_at: new Date(required("upload-start")).toISOString(), upload_ends_at: new Date(required("upload-end")).toISOString(),
  voting_starts_at: new Date(required("voting-start")).toISOString(), voting_ends_at: new Date(required("voting-end")).toISOString(),
  retention_at: new Date(new Date(required("upload-end")).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  shot_limit: Number(args.get("shot-limit") ?? "12"),
};
const { data: event, error } = await client.from("events").insert(record).select("id").single<{ id: string }>();
if (error) throw error;
for (const user of adminUsers) {
  const assignment = await client.from("event_admins").insert({ event_id: event.id, user_id: user.id });
  if (assignment.error) throw assignment.error;
}
const joinUrl = `${siteUrl.replace(/\/$/, "")}/join/${token}`;
const qrPath = path.resolve(args.get("qr") ?? "wedding-qr.svg");
await QRCode.toFile(qrPath, joinUrl, { type: "svg", errorCorrectionLevel: "H", margin: 2, color: { dark: "#171512", light: "#fffdf9" } });
console.log(`Event created: ${event.id}`);
console.log(`Private join URL (store securely; shown once): ${joinUrl}`);
console.log(`QR code: ${qrPath}`);
