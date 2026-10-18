import { contextBridge, ipcRenderer } from "electron";

const CH = { state: "chrome:state", get: "chrome:get-state", action: "chrome:action", focus: "chrome:focus-address" } as const;

// Only the browser's own toolbar page ever gets this API.
if (location.protocol === "nexora:" && location.hostname === "chrome") {
  contextBridge.exposeInMainWorld("nexoraChrome", {
    getState: () => ipcRenderer.invoke(CH.get),
    action: (a: unknown) => ipcRenderer.invoke(CH.action, a),
    onState: (cb: (s: unknown) => void) => { const l = (_e: unknown, s: unknown) => cb(s); ipcRenderer.on(CH.state, l); },
    onFocusAddress: (cb: () => void) => { ipcRenderer.on(CH.focus, () => cb()); },
  });
}
