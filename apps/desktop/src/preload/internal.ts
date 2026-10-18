import { contextBridge, ipcRenderer } from "electron";

// Only nexora:// pages get this API; main re-verifies the sender frame URL on every call.
if (location.protocol === "nexora:") {
  contextBridge.exposeInMainWorld("nexoraInternal", {
    invoke: (method: string, args?: unknown) => ipcRenderer.invoke("internal:invoke", method, args),
    onEvent: (cb: (e: { topic: string }) => void) => { ipcRenderer.on("internal:event", (_e, payload) => cb(payload)); },
  });
}
