export const emptyStudyData = () => ({ tasks: [], activities: [], goalMinutes: 60 });

export function applyStudyChange(data, change) {
  switch (change.kind) {
    case "task.add": return { ...data, tasks: [...data.tasks.filter(t => t.id !== change.task.id), change.task] };
    case "task.done": return { ...data, tasks: data.tasks.map(t => t.id === change.taskId ? { ...t, done: change.done } : t) };
    case "task.delete": return { ...data, tasks: data.tasks.filter(t => t.id !== change.taskId) };
    case "activity.add": return { ...data, activities: [change.activity, ...data.activities.filter(a => a.id !== change.activity.id)].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 2000) };
    case "goal.set": return { ...data, goalMinutes: change.goalMinutes };
    case "replace": return change.data;
    default: throw new Error("无法识别的学习记录变更");
  }
}

/** Serializes local changes through the server revision, rebasing on other devices. */
export function createStudySync({ transport, readCache, writeCache, onChange }) {
  let cached;
  try { cached = readCache(); } catch {}
  let data = cached?.data || emptyStudyData();
  let pending = Array.isArray(cached?.pending) ? cached.pending : [];
  let status = { state: "loading", pending: pending.length };
  let stopped = false, running = null, requested = false;
  let revision;
  const notify = (state, message) => {
    if (stopped) return;
    status = { state, pending: pending.length, ...(message ? { message } : {}) };
    try { writeCache({ data, pending }); } catch {
      status = { ...status, state: "error", message: "浏览器缓存不可用，请保持页面打开并重试同步。" };
    }
    onChange(data, status);
  };
  async function run() {
    let conflicts = 0;
    try {
      if (revision === undefined) {
        notify("loading");
        const remote = await transport.get();
        if (stopped) return;
        revision = remote.revision;
        data = pending.reduce(applyStudyChange, remote.data);
      }
      while (pending.length && !stopped) {
        notify("saving");
        const batch = [...pending];
        const snapshot = data;
        try {
          const remote = await transport.put({ data: snapshot, revision });
          if (stopped) return;
          const ids = new Set(batch.map(change => change.id));
          pending = pending.filter(change => !ids.has(change.id));
          revision = remote.revision;
          data = pending.reduce(applyStudyChange, remote.data);
          conflicts = 0;
        } catch (error) {
          if (stopped) return;
          if (error.status !== 409 || ++conflicts > 3) throw error;
          const remote = await transport.get();
          if (stopped) return;
          revision = remote.revision;
          data = pending.reduce(applyStudyChange, remote.data);
        }
      }
      notify("synced");
    } catch (error) {
      revision = undefined;
      notify("error", error.message || "同步失败，待同步的更改已保存在此浏览器。");
    }
  }
  function sync(refresh = false) {
    if (stopped) return Promise.resolve();
    if (running) { if (refresh) requested = true; return running; }
    if (refresh) revision = undefined;
    running = run().finally(() => {
      running = null;
      if (requested && !stopped) { requested = false; void sync(true); }
    });
    return running;
  }
  return {
    get data() { return data; },
    get status() { return status; },
    change(change) {
      if (stopped) return;
      data = applyStudyChange(data, change);
      pending.push(change);
      notify("saving");
      void sync();
    },
    sync,
    stop() { stopped = true; },
  };
}
