export type ConnState = "connecting" | "live" | "offline" | "error";

const LABELS: Record<ConnState, string> = {
  connecting: "Connecting",
  live: "Live",
  offline: "Offline",
  error: "Connection error",
};

/** Renders a professional live/connecting/offline/error status badge. */
export function statusMarkup(state: ConnState, label?: string): string {
  return `<span class="status status-${state}"><span class="status-dot"></span>${label ?? LABELS[state]}</span>`;
}

export function setStatus(el: HTMLElement, state: ConnState, label?: string): void {
  el.innerHTML = statusMarkup(state, label);
}

/** Human-friendly copy for connection problems — never raw WS error codes. */
export function friendlyDisconnectMessage(willRetry: boolean): string {
  return willRetry
    ? "Connection interrupted. Reconnecting…"
    : "Connection lost. Check your network and rejoin.";
}
