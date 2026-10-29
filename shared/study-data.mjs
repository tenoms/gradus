const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max, label, optional = false) => {
  if (typeof value !== "string" || value.length > max || (!optional && !value.trim()))
    fail(`${label}格式不正确`);
  return value.trim();
};
export function validateStudyData(input) {
  if (!input || !Array.isArray(input.tasks) || !Array.isArray(input.activities) ||
      input.tasks.length > 2000 || input.activities.length > 2000)
    fail("学习记录格式不正确，计划与活动分别最多 2000 条");
  const platform = (value) => {
    if (!["math", "computer"].includes(value)) fail("学习记录学科不正确");
    return value;
  };
  const date = (value, label) => {
    text(value, 40, label);
    if (!Number.isFinite(Date.parse(value))) fail(`${label}格式不正确`);
    return value;
  };
  const tasks = input.tasks.map((task) => {
    if (!task || typeof task.done !== "boolean") fail("学习计划内容不正确");
    return {
      id: text(task.id, 160, "计划编号"), title: text(task.title, 500, "计划标题"),
      platform: platform(task.platform), date: date(task.date, "计划日期"),
      done: task.done, createdAt: date(task.createdAt, "创建时间"),
    };
  });
  const activities = input.activities.map((activity) => {
    if (!activity || typeof activity !== "object") fail("学习活动内容不正确");
    const result = {
      id: text(activity.id, 160, "活动编号"), at: date(activity.at, "活动时间"),
      platform: platform(activity.platform), type: text(activity.type, 100, "活动类型"),
      title: text(activity.title, 500, "活动标题"),
    };
    for (const field of ["correct", "total", "durationSeconds"]) {
      if (activity[field] === undefined) continue;
      if (typeof activity[field] !== "number" || !Number.isFinite(activity[field]) || activity[field] < 0)
        fail("学习活动数值不正确");
      result[field] = activity[field];
    }
    if (activity.path !== undefined) {
      const route = text(activity.path, 1500, "活动链接", true);
      if (route && (!route.startsWith("/") || route.startsWith("//"))) fail("学习活动链接不正确");
      result.path = route;
    }
    return result;
  });
  for (const [rows, label] of [[tasks, "计划"], [activities, "活动"]])
    if (new Set(rows.map((row) => row.id)).size !== rows.length) fail(`${label}编号不能重复`);
  if (!Number.isInteger(input.goalMinutes) || input.goalMinutes < 5 || input.goalMinutes > 480)
    fail("每日学习目标应为 5–480 分钟");
  return { tasks, activities, goalMinutes: input.goalMinutes };
}

