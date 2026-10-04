import { createClient } from "@supabase/supabase-js";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { csv, sha256 } from "../src/lib/export/export-utils";

const [eventId, requestedOutput] = process.argv.slice(2);
if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) throw new Error("Usage: npm run export:event -- <event-uuid> [output-directory]");
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const output = path.resolve(requestedOutput ?? `wedding-export-${eventId}`);
const client = createClient(url, secret, { auth: { persistSession: false } });

const PAGE_SIZE = 500;

async function rows(table: string, filterColumn = "event_id", orderColumn = "created_at") {
  const records: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from(table).select("*").eq(filterColumn, eventId)
      .order(orderColumn, { ascending: true }).order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data as Array<Record<string, unknown>>;
    records.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return records;
}

async function likeRows() {
  const records: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from("likes").select("*,photos!inner(event_id)")
      .eq("photos.event_id", eventId).order("photo_id", { ascending: true })
      .order("guest_session_id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data as Array<Record<string, unknown>>).map((row) => {
      const like = { ...row };
      delete like.photos;
      return like;
    });
    records.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return records;
}

function manifest(records: Array<Record<string, unknown>>) {
  const keys = [...new Set(records.flatMap((record) => Object.keys(record)))].sort();
  return csv([keys, ...records.map((record) => keys.map((key) => record[key]))]);
}

async function exists(file: string) {
  try { await access(file); return true; } catch { return false; }
}

async function downloadAsset(storagePath: string, target: string) {
  if (await exists(target)) return readFile(target);
  const { data, error } = await client.storage.from("wedding-photos").download(storagePath);
  if (error) throw error;
  const contents = Buffer.from(await data.arrayBuffer());
  const temporary = `${target}.partial`;
  await writeFile(temporary, contents, { flag: "w" });
  await rename(temporary, target);
  return contents;
}

await mkdir(path.join(output, "assets", "clean"), { recursive: true });
await mkdir(path.join(output, "assets", "filtered"), { recursive: true });
const [photos, guests, winners] = await Promise.all([rows("photos"), rows("guest_sessions"), rows("winner_selections", "event_id", "selected_at")]);
const likes = await likeRows();

const checksums: unknown[][] = [["sha256", "file"]];
for (const photo of photos) {
  for (const [variant, storagePath] of [["clean", photo.original_path], ["filtered", photo.filtered_path]] as const) {
    if (typeof storagePath !== "string") continue;
    const relative = path.join("assets", variant, `${photo.id}.jpg`);
    const contents = await downloadAsset(storagePath, path.join(output, relative));
    checksums.push([sha256(contents), relative]);
  }
}

await Promise.all([
  writeFile(path.join(output, "photos.csv"), manifest(photos)),
  writeFile(path.join(output, "guests.csv"), manifest(guests)),
  writeFile(path.join(output, "likes.csv"), manifest(likes)),
  writeFile(path.join(output, "winners.csv"), manifest(winners)),
  writeFile(path.join(output, "checksums.sha256.csv"), csv(checksums)),
]);
console.log(`Export complete: ${photos.length} photos, ${guests.length} guests.`);
