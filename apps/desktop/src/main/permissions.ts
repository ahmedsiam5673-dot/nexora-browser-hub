/** Pure permission policy. The Electron layer shows the prompt for "prompt" verdicts. */
export type PermissionVerdict = "allow" | "deny" | "prompt";

const ALLOW = new Set(["fullscreen", "clipboard-sanitized-write", "pointerLock", "keyboardLock"]);
const PROMPT = new Set(["media", "geolocation", "notifications", "clipboard-read"]);

export function isPromptableOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function decidePermission(permission: string, requestingOrigin: string, tabKind: "web" | "internal"): PermissionVerdict {
  if (tabKind === "internal") return "deny"; // browser pages never need device permissions
  if (ALLOW.has(permission)) return "allow";
  if (PROMPT.has(permission)) return isPromptableOrigin(requestingOrigin) ? "prompt" : "deny";
  return "deny"; // usb, hid, serial, bluetooth, openExternal, display-capture, midi, ...
}

export function permissionLabel(permission: string, details?: { mediaTypes?: string[] }): string {
  switch (permission) {
    case "media": {
      const t = details?.mediaTypes ?? [];
      if (t.includes("video") && t.includes("audio")) return "use your camera and microphone";
      if (t.includes("video")) return "use your camera";
      if (t.includes("audio")) return "use your microphone";
      return "use your camera or microphone";
    }
    case "geolocation": return "know your location";
    case "notifications": return "show notifications";
    case "clipboard-read": return "read your clipboard";
    default: return `use ${permission}`;
  }
}
