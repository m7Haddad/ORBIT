/* The single WebSocket client. Connects to /ws/events with the current access
 * token, routes events into the realtime store, reconnects with backoff and a
 * fresh token. Started once by the app shell. */

import { getAccessToken, refreshSession } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";

let socket: WebSocket | null = null;
let stopped = false;
let backoff = 1000;

export function startRealtime() {
  stopped = false;
  connect();
}

export function stopRealtime() {
  stopped = true;
  socket?.close();
  socket = null;
}

function connect() {
  if (stopped) return;
  const token = getAccessToken();
  if (!token) {
    retry();
    return;
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(
    `${protocol}://${window.location.host}/ws/events?token=${encodeURIComponent(token)}`,
  );

  socket.onopen = () => {
    backoff = 1000;
    useRealtime.getState().setWsConnected(true);
  };

  socket.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data as string);
      const store = useRealtime.getState();
      switch (event.type) {
        case "capability.state":
          store.applyCapabilityEvent(event);
          break;
        case "device.availability":
          store.applyAvailabilityEvent(event);
          break;
        case "scene.executed":
          store.applySceneEvent(event);
          break;
      }
    } catch {
      // Malformed frame — ignore.
    }
  };

  socket.onclose = () => {
    useRealtime.getState().setWsConnected(false);
    socket = null;
    retry();
  };
  socket.onerror = () => socket?.close();
}

function retry() {
  if (stopped) return;
  const delay = backoff;
  backoff = Math.min(backoff * 2, 15_000);
  setTimeout(async () => {
    // Token may have expired while disconnected.
    if (!getAccessToken()) await refreshSession();
    connect();
  }, delay);
}
