type ExpiredEvent = {
  eventId: string;
  photos: Array<{ id: string; tempPath: string | null; originalPath: string | null; filteredPath: string | null }>;
  landingPaths: string[];
};

type CleanupDependencies = {
  remove(bucket: "wedding-temp" | "wedding-photos" | "wedding-landing", paths: string[]): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
};

function chunks<T>(items: T[], size = 100) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export async function cleanupExpiredEvent(event: ExpiredEvent, dependencies: CleanupDependencies) {
  const temporary = event.photos.flatMap((photo) => photo.tempPath ? [photo.tempPath] : []);
  const final = [...new Set(event.photos.flatMap((photo) => [
    photo.originalPath ?? `${event.eventId}/${photo.id}/clean.jpg`,
    photo.filteredPath ?? `${event.eventId}/${photo.id}/filtered.jpg`,
  ]))];
  for (const batch of chunks(temporary)) await dependencies.remove("wedding-temp", batch);
  for (const batch of chunks(final)) await dependencies.remove("wedding-photos", batch);
  for (const batch of chunks(event.landingPaths)) await dependencies.remove("wedding-landing", batch);
  await dependencies.deleteEvent(event.eventId);
  return { removedObjects: temporary.length + final.length + event.landingPaths.length };
}
