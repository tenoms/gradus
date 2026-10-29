export const mathSubjects = ["数一", "数二", "数三"];
export const mathStages = [
  { name: "基础", description: "梳理概念与基本方法，按考点打牢基础" },
  { name: "强化", description: "串联题型与解题技巧，用专题训练突破薄弱点" },
  { name: "真题", description: "按年份检验掌握程度，复盘真题中的失分点" },
  { name: "冲刺", description: "限时模拟与查漏补缺，稳定考场得分" },
];
export function initialMathSubject(value) {
  return mathSubjects.find(subject => String(value || "").includes(subject)) || "数一";
}
export function weeklySubjectCode(subject) {
  return { 数一: "10,13,14,15", 数二: "11,13,15", 数三: "12,14,15" }[subject] || "10,13,14,15";
}
export function weeklyStageCode(stage) {
  return stage === "基础" ? "1" : stage === "冲刺" ? "3" : "2";
}
export function matchesMathSubject(row, subject) {
  const value = String(row.SubjectType || row.BusValue || "");
  return !mathSubjects.some(item => value.includes(item)) || value.includes(subject);
}
export function albumStage(row) {
  const explicit = String(row.Stage || row.Phase || row.StageName || "");
  const title = explicit || String(row.Title || row.Name || "");
  // A title such as “基础到强化” belongs to the first learning stage it names.
  if (/基础|入门|零基础|预备/.test(title)) return "基础";
  if (/强化|进阶|提高/.test(title)) return "强化";
  if (/真题|历年/.test(title)) return "真题";
  if (/冲刺|模考|模拟|押题|考前/.test(title)) return "冲刺";
  return "专题拓展";
}
export function groupMathAlbums(rows) {
  const byId = new Map(rows.map(row => [String(row.ID), row]));
  const parentIds = new Set(rows.filter(row => byId.has(String(row.PID))).map(row => String(row.PID)));
  const albums = rows.filter(row => !parentIds.has(String(row.ID)));
  return [...mathStages.map(stage => stage.name), "专题拓展"].map(name => ({
    name,
    rows: albums.filter(row => albumStage(byId.get(String(row.PID)) || row) === name).sort((a, b) => Number(a.Sort || 0) - Number(b.Sort || 0)),
  })).filter(group => group.rows.length);
}
export function mathMenuTree(rows) {
  const copies = rows.map(row => ({ ...row, children: [] }));
  const byId = new Map(copies.map(row => [String(row.ID), row]));
  for (const row of copies) {
    const parent = byId.get(String(row.PID));
    if (parent && parent !== row) parent.children.push(row);
  }
  return copies.filter(row => !byId.has(String(row.PID)) || !row.PID || String(row.ID) === String(row.PID))
    .sort((a, b) => Number(a.Sort || 0) - Number(b.Sort || 0));
}
