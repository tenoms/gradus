export function studyDate(value = Date.now()) {
  return new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

/** Timing updates contribute elapsed time without becoming extra learning actions. */
export function studySummary(activities, { date, platform } = {}) {
  const rows = activities.filter(activity =>
    (!date || studyDate(activity.at) === date) &&
    (!platform || activity.platform === platform),
  );
  const events = rows.filter(activity => activity.type !== "study-time");
  const durationSeconds = rows.reduce((total, activity) => total + (activity.durationSeconds || 0), 0);
  return {
    events,
    durationSeconds,
    questions: events.reduce((total, activity) => total + (activity.total || 0), 0),
    correct: events.reduce((total, activity) => total + (activity.correct || 0), 0),
    graded: events.filter(activity => activity.correct !== undefined)
      .reduce((total, activity) => total + (activity.total || 0), 0),
    days: new Set(rows.filter(activity => activity.type !== "study-time" || activity.durationSeconds > 0)
      .map(activity => studyDate(activity.at))).size,
  };
}

export function studyDurationValue(seconds) {
  const elapsed = Math.floor(seconds);
  return elapsed < 60 ? { value: elapsed, unit: "秒" } : { value: Math.floor(elapsed / 60), unit: "分钟" };
}

export function formatStudyDuration(seconds) {
  const elapsed = Math.floor(seconds);
  if (elapsed < 60) return `${elapsed} 秒`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`;
  return `${Math.floor(elapsed / 3600)} 小时 ${Math.floor(elapsed % 3600 / 60)} 分`;
}

export function studyWeek(activities, now = Date.now()) {
  const end = Date.parse(`${studyDate(now)}T00:00:00+08:00`);
  const counts = new Map();
  for (const activity of activities) {
    if (activity.type === "study-time") continue;
    const date = studyDate(activity.at);
    counts.set(date, (counts.get(date) || 0) + (activity.total || 1));
  }
  return Array.from({ length: 7 }, (_, index) => {
    const date = studyDate(end - (6 - index) * 86400000);
    return { date, count: counts.get(date) || 0 };
  });
}
