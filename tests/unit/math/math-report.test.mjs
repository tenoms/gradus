import test from "node:test";
import assert from "node:assert/strict";
import { configureBrowserConfig } from "../../../src/shared/config/public.mjs";
configureBrowserConfig({ math: { externalUrl: "https://print.example.test/External/", printStationId: 1 } });
import {
  reportTables,
  reportFileLinks,
  scoreGroups,
  weeklyDimensionScores,
  weeklyRhythm,
  weeklyTaskGroups,
} from "../../../src/features/math/exams/report-model.mjs";
test("report download links only use actual HTTP URLs returned by metadata", () => {
  const links = reportFileLinks({
    Files: "https://files.example.test/paper.pdf",
    AswerPdfFiles: "https://files.example.test/sheet.pdf",
    PrintDeploy: JSON.stringify({
      url: "https://files.example.test/print.pdf",
    }),
    Images: "javascript:alert(1)",
    PaperID: 42,
  });
  assert.equal(links.length, 3);
  assert.ok(
    links.every((link) => link.url.startsWith("https://files.example.test/")),
  );
  assert.deepEqual(
    reportFileLinks({ PaperID: 42, PrintDeploy: { width: 200, showTitle: 1 } }),
    [],
  );
  assert.equal(
    reportFileLinks({
      Files:
        "https://files.example.test/paper.pdf;https://files.example.test/paper.pdf",
    }).length,
    1,
  );
});
test("multiple report tables and explicit null data preserve actual absence", () => {
  assert.deepEqual(
    reportTables({ data: [[{ Score: 0 }], [], [{ suncount: 20 }]] })[0],
    [{ Score: 0 }],
  );
  assert.deepEqual(reportTables({ data: null }), []);
});
test("score analysis aggregates actual max scores, zero marks and losses by knowledge area", () => {
  assert.deepEqual(
    scoreGroups([
      { kmName: "计算", Score: 6, QuestionScore: 0 },
      { kmName: "计算", Score: 4, QuestionScore: 4 },
    ]),
    [{ label: "计算", max: 10, score: 4, count: 2, loss: 6, percent: 40 }],
  );
});
test("weekly diagnostic uses source classification and marks absent timing as unavailable", () => {
  const rows = [
    { PropertyContent: "计算", Score: 10, uScore: 5, uTime: 200 },
    { PropertyContent: "证明", Score: 10, uScore: 8, uTime: 300 },
  ];
  const dimensions = weeklyDimensionScores(rows);
  assert.equal(dimensions.find((r) => r.label === "计算执行力").percent, 50);
  assert.equal(dimensions.find((r) => r.label === "逻辑推理力").percent, 80);
  assert.equal(dimensions.find((r) => r.label === "时间掌控力").percent, 50);
  assert.equal(
    weeklyDimensionScores([{ Score: 2, uScore: 1 }]).at(-1).percent,
    null,
  );
});
test("weekly rhythm retains original objective and subjective timeout thresholds", () => {
  const rows = weeklyRhythm([
    { SerialNo: 2, PropertyContent: "解答题", uTime: 901 },
    { SerialNo: 1, PropertyContent: "选择题", uTime: 180 },
    { SerialNo: 3, PropertyContent: "概念" },
  ]);
  assert.equal(rows[0].status, "watch");
  assert.equal(rows[1].status, "slow");
  assert.equal(rows[2].status, "unknown");
});
test("recommended study tasks group around the original two-hour target without losing rows", () => {
  const groups = weeklyTaskGroups([
    { ID: 1, UseTime: 1 },
    { ID: 2, UseTime: 1.5 },
    { ID: 3, UseTime: 0.5 },
  ]);
  assert.deepEqual(
    groups.map((g) => g.rows.map((r) => r.ID)),
    [[1, 2], [3]],
  );
  assert.equal(groups[0].hours, 2.5);
});

import { courseReportPrintLinks } from "../../../src/features/math/exams/report-model.mjs";
test("explicit course print links preserve the three actual legacy paths and exact parameter casing", () => {
  const context = {
    kind: "course",
    stuid: "fixture-student",
    CourseID: 10,
    CalendarID: 20,
    PaperID: 30,
  };
  const links = courseReportPrintLinks(context, {}, [
    { ID: 40, Name: "已生成练习" },
  ]);
  assert.equal(links.length, 3);
  assert.deepEqual(
    links.map((row) => new URL(row.url).pathname),
    [
      "/External/UserprintPdfhead.html",
      "/External/UserprintPdfquestion.html",
      "/External/RecommendPaperPrint.html",
    ],
  );
  assert.deepEqual(Object.fromEntries(new URL(links[0].url).searchParams), {
    courseid: "10",
    calendarid: "20",
    paperid: "30",
    stuid: "fixture-student",
  });
  assert.deepEqual(Object.fromEntries(new URL(links[2].url).searchParams), {
    courseID: "10",
    calendarID: "20",
    PaperID: "40",
    StuID: "fixture-student",
  });
  assert.ok(
    links.every(
      (row) => new URL(row.url).origin === "https://print.example.test",
    ),
  );
  assert.deepEqual(
    courseReportPrintLinks({ ...context, isAbility: true }, {}),
    [],
  );
  assert.deepEqual(
    courseReportPrintLinks({ ...context, isTeacher: true }, {}),
    [],
  );
  assert.deepEqual(
    courseReportPrintLinks({ ...context, CalendarID: undefined }, {}),
    [],
  );
});
test("original course print entries prefer the corresponding actual returned files", () => {
  const links = courseReportPrintLinks(
    {
      kind: "course",
      stuid: "fixture-student",
      CourseID: 10,
      CalendarID: 20,
      PaperID: 30,
    },
    {
      Files: "https://files.example.test/original.pdf",
      AnswerFiles: "https://files.example.test/answer.pdf",
    },
    [{ ID: 40, Files: "https://files.example.test/recommend.pdf" }],
  );
  assert.deepEqual(
    links.map((row) => row.url),
    [
      "https://files.example.test/original.pdf",
      "https://files.example.test/answer.pdf",
      "https://files.example.test/recommend.pdf",
    ],
  );
});
