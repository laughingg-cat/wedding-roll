import { notFound } from "next/navigation";

import { AdminDashboard } from "@/features/admin/AdminDashboard";
import { GalleryFeed } from "@/features/gallery/GalleryFeed";
import { PreviewWelcome } from "./preview-welcome";

const previewPhotos = [
  { id: "1", author: "Maya", preset: "portra_400" as const, capturedAt: "2027-08-24T10:30:00.000Z", likeCount: 24, likedByMe: true, isMine: false, mediaUrl: "/images/welcome-reception.png" },
  { id: "2", author: "Luca", preset: "quicksnap" as const, capturedAt: "2027-08-24T11:12:00.000Z", likeCount: 18, likedByMe: false, isMine: false, mediaUrl: "/images/welcome-reception.png" },
  { id: "3", author: "You", preset: "hp5_plus" as const, capturedAt: "2027-08-24T11:42:00.000Z", likeCount: 11, likedByMe: false, isMine: true, mediaUrl: "/images/welcome-reception.png" },
  { id: "4", author: "Noah", preset: "cinestill_800t" as const, capturedAt: "2027-08-24T12:04:00.000Z", likeCount: 9, likedByMe: false, isMine: false, mediaUrl: "/images/welcome-reception.png" },
];

export default async function DesignPreview({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const screen = (await searchParams).screen;
  if (screen === "gallery") return <GalleryFeed eventTimeZone="Asia/Tokyo" initialPhotos={previewPhotos} initialWinners={[{ photoId: "1", placement: 1, awardLabel: "Guest favourite", author: "Maya", mediaUrl: "/images/welcome-reception.png" }]} />;
  if (screen === "admin") return <AdminDashboard previewMode initialSnapshot={{ event: { id: "preview", name: "Taylor & Sam", timezone: "Asia/Tokyo", uploadStartsAt: "2027-08-23T23:00:00.000Z", uploadEndsAt: "2027-08-24T14:00:00.000Z", votingStartsAt: "2027-08-23T23:00:00.000Z", votingEndsAt: "2027-08-24T15:00:00.000Z", uploadsPaused: false, votingPaused: false, winnersRevealed: false, retentionAt: "2027-09-24T00:00:00.000Z", shotLimit: 12 }, stats: { guests: 186, visible: 742, hidden: 4, failed: 3, processing: 2 }, photos: previewPhotos.map((photo, index) => ({ id: photo.id, author: photo.author, likeCount: photo.likeCount, status: index === 3 ? "hidden" : "visible", capturedAt: photo.capturedAt, rank: index + 1, tied: false })) }} />;
  return <PreviewWelcome />;
}
