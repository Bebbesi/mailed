import { sqlClient } from "./db";
import { EVENTS_CHANNEL, type MailboxEvent } from "./events";
import { logger } from "./logger";

type Listener = (event: MailboxEvent) => void;

const globalState = globalThis as unknown as {
  __mailedRealtime?: { subscribers: Map<string, Set<Listener>>; ready: Promise<void> | null };
};

function state() {
  globalState.__mailedRealtime ??= { subscribers: new Map(), ready: null };
  return globalState.__mailedRealtime;
}

/** One LISTEN connection per process, fanned out to the user's open streams. */
function ensureListening() {
  const s = state();
  s.ready ??= sqlClient()
    .listen(EVENTS_CHANNEL, (payload) => {
      try {
        const { u, e } = JSON.parse(payload) as { u: string; e: MailboxEvent };
        s.subscribers.get(u)?.forEach((fn) => fn(e));
      } catch (err) {
        logger.warn({ err }, "invalid realtime payload");
      }
    })
    .then(() => undefined)
    .catch((err) => {
      logger.error({ err }, "realtime LISTEN failed");
      s.ready = null;
    });
  return s.ready;
}

export async function subscribeUser(userId: string, fn: Listener): Promise<() => void> {
  await ensureListening();
  const s = state();
  const set = s.subscribers.get(userId) ?? new Set<Listener>();
  set.add(fn);
  s.subscribers.set(userId, set);
  return () => {
    set.delete(fn);
    if (set.size === 0) s.subscribers.delete(userId);
  };
}
