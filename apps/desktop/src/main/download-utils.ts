import path from "node:path";

const DANGEROUS = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "cpl", "msc", "reg", "lnk", "jar",
  "apk", "app", "dmg", "pkg", "deb", "rpm", "sh", "bash", "command", "run", "appimage", "action", "workflow", "dll", "sys", "iso", "docm", "xlsm", "pptm",
]);

export function isDangerousFile(name: string): boolean {
  const ext = path.extname(name).slice(1).toLowerCase();
  return DANGEROUS.has(ext);
}

/** Strip any directory components and characters that are unsafe on common filesystems. */
export function safeFileName(name: string): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  let n = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/^[. ]+|[. ]+$/g, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = `_${n}`;
  if (n.length > 200) { const ext = path.extname(n).slice(0, 20); n = n.slice(0, 200 - ext.length) + ext; }
  return n || "download";
}

export function uniqueFileName(dir: string, name: string, exists: (p: string) => boolean): string {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let i = 1; exists(path.join(dir, candidate)); i++) candidate = `${stem} (${i})${ext}`;
  return candidate;
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}
