/**
 * Session-partition naming for the desktop browser.
 * Persistent profiles map to `persist:` partitions (on-disk, per profile).
 * Private sessions map to NON-persist partitions (in-memory only), unique per session.
 * Keeping this pure lets tests prove profiles and private sessions can never collide.
 */
export const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidProfileId(id: string): boolean {
  return PROFILE_ID_PATTERN.test(id);
}

export function persistentPartition(profileId: string): string {
  if (!isValidProfileId(profileId)) throw new Error("Invalid profile id");
  return `persist:nexora-profile-${profileId}`;
}

export function privatePartition(sessionId: string): string {
  if (!isValidProfileId(sessionId)) throw new Error("Invalid session id");
  // No "persist:" prefix => Electron keeps this session in memory only.
  return `nexora-private-${sessionId}`;
}

export function isPersistentPartition(partition: string): boolean {
  return partition.startsWith("persist:");
}

export const MAX_PROFILE_NAME_LENGTH = 40;

export function sanitizeProfileName(name: string): string | null {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  if (n.length === 0 || n.length > MAX_PROFILE_NAME_LENGTH) return null;
  if (/[\u0000-\u001f<>]/.test(n)) return null;
  return n;
}

export function slugifyProfileName(name: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "profile";
}
