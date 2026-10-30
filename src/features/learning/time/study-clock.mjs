import { createId } from "../../../shared/lib/id.mjs";

const shanghaiDay = timestamp => new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10);
const nextMidnight = day => Date.parse(`${day}T00:00:00+08:00`) + 86400000;

/** One foreground learning context owns each elapsed second; media takes precedence over reading. */
export function createStudyClock({ report, now = Date.now, makeId = createId, idleMs = 300000, flushMs = 30000 }) {
  const sessions = new Map();
  let foreground = false, last = now(), lastInteraction = last, lastFlush = last, order = 0;

  function checkpoint() {
    const end = now(), start = last;
    last = end;
    if (!foreground || end <= start) return;
    const active = [...sessions.values()].filter(session => session.enabled)
      .sort((a, b) => Number(b.mode === "media") - Number(a.mode === "media") || b.order - a.order)[0];
    if (!active) return;
    const until = active.mode === "media" ? end : Math.min(end, lastInteraction + idleMs);
    for (let cursor = start; cursor < until;) {
      const day = shanghaiDay(cursor), stop = Math.min(until, nextMidnight(day));
      let entry = active.days.get(day);
      if (!entry) {
        entry = { id: makeId(), milliseconds: 0, reported: 0, at: "" };
        active.days.set(day, entry);
      }
      entry.milliseconds += stop - cursor;
      entry.at = new Date(stop - 1).toISOString();
      cursor = stop;
    }
  }

  function flush(session) {
    for (const entry of session.days.values()) {
      const seconds = Math.floor(entry.milliseconds / 1000);
      if (seconds <= entry.reported) continue;
      report({ id: entry.id, at: entry.at, platform: session.platform, type: "study-time", title: session.title, path: session.path, durationSeconds: seconds, studyMode: session.mode });
      entry.reported = seconds;
    }
  }
  function flushAll() { sessions.forEach(flush); lastFlush = now(); }

  return {
    register({ platform, title, path, mode = "reading", enabled = true }) {
      checkpoint();
      const session = { platform, title, path, mode, enabled, days: new Map(), order: ++order };
      sessions.set(session.order, session);
      if (enabled) lastInteraction = now();
      return {
        setEnabled(value) {
          if (!sessions.has(session.order) || session.enabled === value) return;
          checkpoint();
          session.enabled = value;
          if (value) lastInteraction = now();
          else flush(session);
        },
        stop() {
          if (!sessions.has(session.order)) return;
          checkpoint();
          flush(session);
          sessions.delete(session.order);
        },
      };
    },
    interact() { checkpoint(); lastInteraction = now(); },
    setForeground(value) {
      checkpoint();
      foreground = value;
      if (value) lastInteraction = now();
      else flushAll();
    },
    tick() { checkpoint(); if (now() - lastFlush >= flushMs) flushAll(); },
    reset() {
      checkpoint();
      flushAll();
      sessions.clear();
      foreground = false;
    },
  };
}
