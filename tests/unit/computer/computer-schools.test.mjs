import test from "node:test";
import assert from "node:assert/strict";
import {
  schoolQuery,
  schoolTags,
  schoolHasFeature,
  schoolRowKey,
  schoolMetric,
  targetSchoolIds,
  targetSchoolPayload,
  matchingSchoolPlan,
} from "../../../src/features/computer/schools/school-model.mjs";

test("school query preserves repeated province and major values and original degree and score semantics", () => {
  const q = schoolQuery(
    {
      year: "2026",
      degree: "1",
      provinces: ["11", "33"],
      majors: ["081200", "085404"],
      subject: "11408",
      score: "400-",
    },
    3,
  );
  assert.deepEqual(q.provinceIdList, ["11", "33"]);
  assert.deepEqual(q.csCodeList, ["081200", "085404"]);
  assert.equal(q.degreeType, "1");
  assert.equal(q.firstScoreMin, "400");
  assert.equal(q.firstScoreMax, "");
  assert.equal(q.pageNum, 3);
  assert.equal(q.firstSubject, "11408");
});
test("public school rows keep distinct professional plans and preserve meaningful zero metrics", () => {
  const school = {
    id: "college",
    is985: "1",
    is211: 1,
    isSyl: 0,
    planList: [{ id: "p1" }],
  };
  assert.deepEqual(schoolTags(school), ["985", "211"]);
  assert.equal(schoolHasFeature(school, "isSyl"), false);
  assert.notEqual(
    schoolRowKey(school),
    schoolRowKey({ ...school, planList: [{ id: "p2" }] }),
  );
  assert.equal(schoolMetric(0), "0");
  assert.equal(schoolMetric(null), "—");
});
test("target schools use the original schoolId parameter and cannot silently save an unrelated admissions ID", () => {
  const catalog = [
    { id: "original-a" },
    { id: "original-b" },
    { id: "original-c" },
    { id: "original-d" },
  ];
  assert.deepEqual(
    targetSchoolIds({ targetSchoolId: "original-a,original-b,original-a" }),
    ["original-a", "original-b"],
  );
  assert.deepEqual(targetSchoolPayload(["original-b", "original-a"], catalog), {
    schoolId: "original-b,original-a",
  });
  assert.throws(
    () => targetSchoolPayload(["admissions-id"], catalog),
    /原目标目录/,
  );
  assert.throws(() => targetSchoolPayload([], catalog), /请选择目标院校/);
  assert.deepEqual(targetSchoolPayload(catalog.map(row => row.id), catalog), { schoolId: catalog.map(row => row.id).join(",") });
});
test("comparison matches the selected major, college and year instead of borrowing another year score", () => {
  const plans = [
    {
      id: "old",
      year: 2025,
      specialCode: "0812",
      departId: "d1",
      minScore: 300,
    },
    {
      id: "other",
      year: 2026,
      specialCode: "0812",
      departId: "d2",
      minScore: 320,
    },
    {
      id: "right",
      year: 2026,
      specialCode: "0812",
      departId: "d1",
      minScore: 0,
    },
  ];
  assert.equal(
    matchingSchoolPlan(
      plans,
      { planList: [{ specialCode: "0812", departId: "d1" }] },
      "2026",
    ).id,
    "right",
  );
  assert.equal(matchingSchoolPlan(plans, {}, "2027"), undefined);
});

import { readFile } from "node:fs/promises";
import ts from "typescript";
globalThis.__schoolFixture = {
  schoolQuery,
  targetSchoolPayload,
  records: (data) => (Array.isArray(data) ? data : data?.list || []),
  computerRequest: (...args) => globalThis.__schoolRequest(...args),
};
const source = await readFile(
  new URL("../../../src/features/computer/schools/computer-schools.ts", import.meta.url),
  "utf8",
);
const output = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(/import \{[^}]+\} from ['"][^'"]+['"];?/g, "");
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from("const {computerRequest,records,schoolQuery,targetSchoolPayload}=globalThis.__schoolFixture;" + output).toString("base64")}`
);
test("school adapter saves selected targets without a separate entitlement request", async () => {
  const calls = [];
  globalThis.__schoolRequest = async (...args) => {
    calls.push(args);
    return [];
  };
  await adapter.computerSchoolApi.saveTargets(
    ["original-a"],
    [{ id: "original-a" }],
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "/api/user/wx/user/addTargetSchool",
    { schoolId: "original-a" },
  ]);
});
test("comparison fetches actual paginated plans for each selected school and year", async () => {
  const calls = [];
  globalThis.__schoolRequest = async (path, query) => {
    calls.push({ path, query });
    if (path.includes("/detail/")) return { id: "a" };
    return {
      list: [{ id: `p${query.pageNum}` }],
      hasNextPage: query.pageNum === 1,
    };
  };
  const result = await adapter.computerSchoolApi.comparison("a", "2026");
  assert.deepEqual(
    result.plans.map((p) => p.id),
    ["p1", "p2"],
  );
  assert.equal(calls[1].query.schoolId, "a");
  assert.equal(calls[2].query.year, "2026");
  assert.equal(calls[2].query.pageNum, 2);
});
