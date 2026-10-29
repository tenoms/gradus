export function studyDate(value = Date.now()) {
  return new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

export function filterStudyActivities(activities, { date, platform, fromDate, toDate } = {}) {
  return activities.filter(activity => {
    const day = studyDate(activity.at);
    return (!date || day === date) && (!fromDate || day >= fromDate) &&
      (!toDate || day <= toDate) && (!platform || activity.platform === platform);
  });
}

/** Inclusive Shanghai calendar dates; future records are outside every reporting period. */
export function studyPeriodRange(days, now = Date.now()) {
  const toDate = studyDate(now);
  const midnight = Date.parse(`${toDate}T00:00:00+08:00`);
  return { ...(days === "all" ? {} : { fromDate: studyDate(midnight - (days - 1) * 86400000) }), toDate };
}

/** Timing updates contribute elapsed time without becoming extra learning actions. */
export function studySummary(activities, options = {}) {
  const rows = filterStudyActivities(activities, options);
  const events = rows.filter(activity => activity.type !== "study-time");
  const durationSeconds = rows.reduce((total, activity) => total + (activity.durationSeconds || 0), 0);
  return {
    events,
    durationSeconds,
    questions: events.reduce((total, activity) => total + (activity.total || 0), 0),
    correct: events.reduce((total, activity) => total + (activity.correct || 0), 0),
    graded: events.reduce((total, activity) => total + (activity.graded ?? (activity.correct !== undefined ? activity.total || 0 : 0)), 0),
    days: new Set(rows.filter(activity => activity.type !== "study-time" || activity.durationSeconds > 0)
      .map(activity => studyDate(activity.at))).size,
  };
}

export function studyTimeBreakdown(activities, options = {}) {
  const totals = { reading: 0, media: 0, unclassified: 0 };
  for (const activity of filterStudyActivities(activities, options)) {
    const mode = activity.studyMode === "reading" || activity.studyMode === "media" ? activity.studyMode : "unclassified";
    totals[mode] += activity.durationSeconds || 0;
  }
  return [
    { key: "reading", label: "阅读与作答", durationSeconds: totals.reading },
    { key: "media", label: "视频学习", durationSeconds: totals.media },
    { key: "unclassified", label: "未分类时长", durationSeconds: totals.unclassified },
  ];
}

export function studyTrend(activities, { days = 7, now = Date.now(), platform, metric = "activities" } = {}) {
  const end = Date.parse(`${studyDate(now)}T00:00:00+08:00`);
  const daily = new Map();
  for (const activity of activities) {
    if (platform && activity.platform !== platform) continue;
    const day = studyDate(activity.at);
    const item = daily.get(day) || { durationSeconds: 0, questions: 0, activityCount: 0 };
    item.durationSeconds += activity.durationSeconds || 0;
    if (activity.type !== "study-time") {
      item.questions += activity.total || 0;
      item.activityCount++;
    }
    daily.set(day, item);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = studyDate(end - (days - index - 1) * 86400000);
    const item = daily.get(date) || { durationSeconds: 0, questions: 0, activityCount: 0 };
    return { date, ...item, count: metric === "duration" ? item.durationSeconds : metric === "questions" ? item.questions : item.activityCount };
  });
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
