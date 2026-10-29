import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as summary from "../../../src/features/learning/study-summary.mjs";

const source = await readFile(new URL("../../../src/features/learning/reports/StudyInsights.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText.replace(/^import .*;\n/gm, "");
const fixture = { rows: [], state: [], cursor: 0, params: new URLSearchParams(), changes: [] };
const helpers = {
  ...summary,
  React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(child => child !== false && child !== null && child !== undefined) }) },
  useStudyData: () => ({ activities: fixture.rows }),
  useRef: () => ({ current: null }),
  useState(initial) { const index = fixture.cursor++; if (!Object.hasOwn(fixture.state, index)) fixture.state[index] = initial; return [fixture.state[index], value => { fixture.state[index] = value; }]; },
  useSearchParams: () => [fixture.params, update => { fixture.params = new URLSearchParams(typeof update === "function" ? update(fixture.params) : update); }],
  usePagination: ({ total }) => ({ page: 1, pageSize: 20, start: 0, end: total, setPage() {}, setPageSize() {} }),
  exportStudyData() {},
  label: platform => platform === "math" ? "考研数学" : "计算机 408",
  Link: "Link", WeeklyChart: "WeeklyChart", Pagination: "Pagination",
};
for (const icon of ["ArrowDownToLine", "ArrowRight", "BookOpen", "ChartNoAxesCombined", "CheckCircle2", "Clock3", "Code2", "Sigma"]) helpers[icon] = `Icon${icon}`;
globalThis.__studyReportFixture = helpers;
const { default: StudyInsights } = await import(`data:text/javascript;base64,${Buffer.from(`const {${Object.keys(helpers).join(",")}} = globalThis.__studyReportFixture;\n${output}`).toString("base64")}`);
const text = node => typeof node === "object" ? (node?.children || []).map(text).join("") : String(node ?? "");
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  return (node.children || []).map(child => find(child, predicate)).find(Boolean);
}
function all(node, predicate) {
  if (!node || typeof node !== "object") return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => all(child, predicate))];
}
const date = days => new Date(Date.parse(`${summary.studyDate()}T12:00:00+08:00`) - days * 86400000).toISOString();
const row = (id, platform, type, extra = {}) => ({ id, at: date(0), platform, type, title: id, ...extra });
function setup(query = "") {
  fixture.rows = [
    row("数学练习", "math", "practice", { total: 4, correct: 3, graded: 4, path: "/study/practice" }),
    row("阅读计时（内部）", "math", "study-time", { studyMode: "reading", durationSeconds: 60 }),
    row("408待批改练习", "computer", "exam", { total: 10, graded: 0, path: "/study/exams" }),
    row("视频计时（内部）", "computer", "study-time", { studyMode: "media", durationSeconds: 120 }),
    row("十天前408练习", "computer", "practice", { at: date(10), total: 2, correct: 1, graded: 2 }),
    row("十天前时长", "computer", "study-time", { at: date(10), durationSeconds: 30 }),
    row("未来活动", "math", "practice", { at: date(-1), total: 99, correct: 99 }),
  ];
  fixture.state = []; fixture.params = new URLSearchParams(query); fixture.changes = [];
  return () => { fixture.cursor = 0; return StudyInsights({ platform: "math", onPlatformChange: platform => fixture.changes.push(platform) }); };
}
const stats = tree => text(find(tree, node => String(node.props.className).split(" ").includes("report-stats")));

test("report applies its period and subject consistently without turning timer updates into activities", () => {
  const render = setup();
  const tree = render();
  assert.match(stats(tree), /练习题次14题/);
  assert.match(stats(tree), /已批改正确率75%/);
  assert.match(stats(tree), /待批改 10 题/);
  assert.match(stats(tree), /学习时长3分钟/);
  const chart = find(tree, node => node.type === "WeeklyChart");
  assert.equal(chart.props.metric, "duration");
  assert.equal(chart.props.rangeDays, 7);
  assert.equal(chart.props.activities.length, 4);
  const records = find(tree, node => String(node.props.className).split(" ").includes("report-records"));
  assert.equal(all(records, node => node.type === "tr").length, 3);
  assert.doesNotMatch(text(records), /内部|十天前|未来活动/);
  assert.match(text(records), /待批改/);
});

test("subject selection updates the shareable report scope, all metrics and the business navigation subject", () => {
  const render = setup();
  find(render(), node => node.type === "button" && text(node) === "计算机 408").props.onClick();
  const tree = render();
  assert.equal(fixture.params.get("subject"), "computer");
  assert.deepEqual(fixture.changes, ["computer"]);
  assert.match(stats(tree), /练习题次10题/);
  assert.match(stats(tree), /已批改正确率—/);
  assert.match(stats(tree), /暂无已批改题目 · 待批改 10 题/);
  assert.ok(find(tree, node => node.type === "WeeklyChart").props.activities.every(activity => activity.platform === "computer"));
  const link = find(tree, node => node.type === "Link" && text(node) === "408待批改练习");
  link.props.onClick();
  assert.equal(fixture.changes.at(-1), "computer");
  assert.equal(link.props.to, "/study/exams");
});

test("report opens dashboard subject links and keeps period, trend and history in sync", () => {
  const render = setup("subject=computer&period=30");
  let tree = render();
  assert.match(stats(tree), /练习题次12题/);
  assert.match(stats(tree), /已批改正确率50%/);
  assert.match(stats(tree), /待批改 10 题/);
  assert.match(text(tree), /未分类时长/);
  assert.equal(find(tree, node => node.type === "WeeklyChart").props.rangeDays, 30);
  const periodSelect = find(tree, node => node.type === "select" && node.props["aria-label"] === "学习报告统计时间范围");
  periodSelect.props.onChange({ target: { value: "7" } });
  tree = render();
  assert.equal(fixture.params.get("subject"), "computer");
  assert.equal(fixture.params.get("period"), "7");
  assert.match(stats(tree), /练习题次10题/);
  assert.equal(find(tree, node => node.type === "WeeklyChart").props.rangeDays, 7);
});

test("mixed grading presents pending answers separately from checked answers", () => {
  const render = setup("subject=math&period=all");
  fixture.rows.push(row("部分批改测评", "math", "exam", { total: 5, correct: 2, graded: 3 }));
  const tree = render();
  const records = find(tree, node => String(node.props.className).split(" ").includes("report-records"));
  assert.match(text(records), /2\/3 题正确 · 2 题待批改/);
  assert.match(stats(tree), /待批改 2 题/);
  assert.doesNotMatch(text(records), /未来活动/);
});
