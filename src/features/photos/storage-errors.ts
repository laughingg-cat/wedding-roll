export function isStorageAlreadyExists(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: string | number; message?: string };
  return String(candidate.statusCode) === "409" || /already exists|duplicate/i.test(candidate.message ?? "");
}
