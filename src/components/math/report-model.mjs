export function reportTables(response) {
  const value =
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    ("data" in response || "Data" in response)
      ? (response.data ?? response.Data)
      : response;
  if (Array.isArray(value)) return Array.isArray(value[0]) ? value : [value];
  return value && typeof value === "object" ? [[value]] : [];
}
export function reportRows(response, index = 0) {
  return reportTables(response)[index] || [];
}
const fileNames = {
  AswerPdfFiles: "答题卡",
  AnswerPdfFiles: "答案资料",
  AnswerFiles: "答案资料",
  Files: "试卷与学习资料",
  Images: "图片资料",
  PrintDeploy: "打印资料",
};
export function reportFileLinks(...sources) {
  const links = [],
    seen = new Set();
  const visit = (value, label, depth) => {
    if (depth > 6 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, label, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value))
        if (/files?|pdf|url|link|href|printdeploy|images?/i.test(key))
          visit(
            item,
            fileNames[key] || value.Name || value.Title || label,
            depth + 1,
          );
      return;
    }
    if (typeof value !== "string") return;
    const text = value.trim();
    if (!text) return;
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        visit(JSON.parse(text), label, depth + 1);
      } catch {}
      return;
    }
    for (const raw of text.split(/[;\n]|,(?=https?:\/\/)/)) {
      try {
        const url = new URL(raw.trim());
        if (!["https:", "http:"].includes(url.protocol) || seen.has(url.href))
          continue;
        seen.add(url.href);
        links.push({ url: url.href, label: String(label || "学习资料") });
      } catch {}
    }
  };
  for (const source of sources) visit(source, "学习资料", 0);
  return links;
}
export function scoreGroups(rows, field = "kmName") {
  const groups = new Map();
  for (const row of rows) {
    const label = String(row[field] || row.Name || "未分类"),
      max = Number(row.Score ?? row.qScore ?? 0) || 0,
      score = Number(row.QuestionScore ?? row.uScore ?? 0) || 0;
    const group = groups.get(label) || { label, max: 0, score: 0, count: 0 };
    group.max += max;
    group.score += score;
    group.count++;
    groups.set(label, group);
  }
  return [...groups.values()].map((row) => ({
    ...row,
    loss: Math.max(0, row.max - row.score),
    percent: row.max > 0 ? Math.round((row.score / row.max) * 100) : null,
  }));
}
export function classifyWeeklyDimension(row) {
  const value = String(row.PropertyContent || row.PropertyContent2 || "");
  return value.includes("计算")
    ? "计算执行力"
    : value.includes("证明")
      ? "逻辑推理力"
      : value.includes("应用")
        ? "综合转化力"
        : "概念透析度";
}
export function weeklyDimensionScores(rows) {
  if (!rows.length) return [];
  const names = ["概念透析度", "计算执行力", "逻辑推理力", "综合转化力"];
  const result = names.map((label) => ({
    label,
    score: 0,
    max: 0,
    percent: null,
  }));
  for (const row of rows) {
    const dimension = result.find(
      (r) => r.label === classifyWeeklyDimension(row),
    );
    dimension.score += Number(row.uScore || 0);
    dimension.max += Number(row.Score || 0);
  }
  for (const row of result)
    row.percent = row.max > 0 ? Math.round((row.score / row.max) * 100) : null;
  const timed = rows.filter(
    (row) => row.uTime !== undefined && row.uTime !== null,
  );
  const onTime = timed.filter(
    (row) =>
      Number(row.uTime) <=
      (/解答|证明|综合/.test(String(row.PropertyContent || "")) ? 360 : 180),
  ).length;
  result.push({
    label: "时间掌控力",
    score: onTime,
    max: timed.length,
    percent: timed.length ? Math.round((onTime / timed.length) * 100) : null,
  });
  return result;
}
export function weeklyRhythm(rows) {
  return rows
    .map((row, index) => {
      const seconds =
          row.uTime == null ? null : Math.max(0, Number(row.uTime) || 0),
        long = /解答|证明|综合/.test(String(row.PropertyContent || ""));
      return {
        id: row.QuestionID || row.ID,
        number: Number(row.SerialNo) || index + 1,
        seconds,
        status:
          seconds === null
            ? "unknown"
            : seconds > (long ? 900 : 360)
              ? "slow"
              : seconds >= (long ? 360 : 180)
                ? "watch"
                : "steady",
      };
    })
    .sort((a, b) => a.number - b.number);
}
export function weeklyTaskGroups(rows, hours = 2) {
  const groups = [];
  let group = { rows: [], hours: 0 };
  for (const row of rows) {
    group.rows.push(row);
    group.hours += Math.max(0, Number(row.UseTime) || 0);
    if (group.hours >= hours) {
      groups.push(group);
      group = { rows: [], hours: 0 };
    }
  }
  if (group.rows.length) groups.push(group);
  return groups;
}

export function courseReportPrintLinks(context, meta, papers = []) {
  if (
    context?.kind !== "course" ||
    context.isAbility ||
    context.isTeacher ||
    !context.stuid ||
    !(Number(context.CourseID) > 0) ||
    !(Number(context.CalendarID) > 0) ||
    !(Number(context.PaperID) > 0)
  )
    return [];
  const fixed = (filename, paper, legacy = false) => {
    const url = new URL("https://web.math-upstream.invalid/External/" + filename);
    for (const [key, value] of Object.entries(
      legacy
        ? {
            courseID: context.CourseID,
            calendarID: context.CalendarID,
            PaperID: paper,
            StuID: context.stuid,
          }
        : {
            courseid: context.CourseID,
            calendarid: context.CalendarID,
            paperid: paper,
            stuid: context.stuid,
          },
    ))
      url.searchParams.set(key, String(value));
    return url.href;
  };
  const actual = (...values) =>
    reportFileLinks(...values.map((Files) => ({ Files })))[0]?.url;
  const links = [
    {
      label: "原试卷打印",
      url:
        actual(meta?.Files) || fixed("UserprintPdfhead.html", context.PaperID),
    },
    {
      label: "试卷解析打印",
      url:
        actual(meta?.AnswerPdfFiles, meta?.AnswerFiles) ||
        fixed("UserprintPdfquestion.html", context.PaperID),
    },
  ];
  for (const paper of papers) {
    if (!(Number(paper.ID) > 0)) continue;
    links.push({
      label: String(paper.Name || paper.Title || "推荐练习") + " · 打印",
      url:
        actual(paper.Files) ||
        fixed("RecommendPaperPrint.html", paper.ID, true),
    });
  }
  return links.filter(
    (row, index) => links.findIndex((item) => item.url === row.url) === index,
  );
}
