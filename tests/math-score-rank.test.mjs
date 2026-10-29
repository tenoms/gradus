import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
globalThis.__scoreFixture = {
  mathData: (r) => r?.data ?? r?.Data ?? r,
  mathRows: (r) => {
    const d = r?.data ?? r?.Data ?? r;
    return Array.isArray(d) ? (Array.isArray(d[0]) ? d[0] : d) : [];
  },
  mathCommand: (...args) => globalThis.__scoreCommand(...args),
};
const source = await readFile(
  new URL("../src/features/math/profile/math-score-rank.ts", import.meta.url),
  "utf8",
);
const output = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /import \{ api \} from ['"]\.\.\/\.\.\/\.\.\/shared\/api\/client['"];?/,
    "const api=(...args)=>globalThis.__scoreApi(...args);",
  )
  .replace(
    /import \{([^}]+)\} from ['"]\.\.\/api\/math['"];?/,
    (_, names) => `const {${names}}=globalThis.__scoreFixture;`,
  );
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);
const metadata = [
  {
    Subject1: "管理类综合",
    Subject1Score: 200,
    Subject2: "英语二",
    Subject2Score: 100,
  },
  {
    Subject1: "管理类综合",
    Subject1Score: 999,
    Subject2: "其他英语",
    Subject2Score: 100,
  },
];
const form = {
  ...adapter.emptyFirstScore(),
  Name: "fixture",
  BenSchoolName: "fixture school",
  SchoolCode: "school",
  SchoolName: "school",
  XueYuanName: "college",
  MajorCode: "major",
  DirectionName: "direction",
  IsQuanRiZ: 1,
  Subject1: "管理类综合",
  Subject1Score: 190,
  Subject2: "英语二",
  Subject2Score: 80,
  ScoreImg: "https://fixture.invalid/proof.png",
};
test("score subjects use first matching metadata name and support 200/300-point exams", () => {
  assert.deepEqual(adapter.scoreSubjectOptions(metadata, 1), [
    { name: "管理类综合", max: 200 },
  ]);
  assert.equal(adapter.buildFirstScore(form, metadata, true).TotalScore, 270);
  assert.equal(
    adapter.buildFirstScore(
      { ...form, Subject3: "专业综合", Subject3Score: 290 },
      [...metadata, { Subject3: "专业综合", Subject3Score: 300 }],
      true,
    ).TotalScore,
    560,
  );
  assert.throws(
    () =>
      adapter.buildFirstScore({ ...form, Subject1Score: 201 }, metadata, true),
    /200/,
  );
});
test("score submission requires actual configured subjects and certification, while drafts may remain partial", () => {
  assert.equal(adapter.buildFirstScore({}, [], false).IsFinish, 0);
  assert.throws(
    () => adapter.buildFirstScore({ ...form, ScoreImg: "" }, metadata, true),
    /证明/,
  );
  assert.throws(
    () =>
      adapter.buildFirstScore({ ...form, Subject2Score: "" }, metadata, true),
    /第 2 科/,
  );
  assert.equal(
    adapter.buildFirstScore({ ...form, Subject1Score: 0 }, metadata, true)
      .Subject1Score,
    0,
  );
  assert.equal(adapter.buildFirstScore(form, metadata, true).Subject3Score, "");
});
test("score payload carries only original business fields and never client keys or execution targets", () => {
  const payload = adapter.buildFirstScore(
    {
      ...form,
      Key: "forged",
      StuID: "other",
      ID: 99,
      UserRoot: 9,
      name: "other-table",
      where: { x: 1 },
    },
    metadata,
    true,
  );
  assert.equal(payload.Key, undefined);
  assert.equal(payload.StuID, undefined);
  assert.equal(payload.ID, undefined);
  assert.equal(payload.UserRoot, undefined);
  assert.equal(payload.name, undefined);
  assert.equal(payload.where, undefined);
  assert.equal(payload.BusYear, 2026);
});
test("full major, direction and college rank groups keep own rank and aggregate scores", () => {
  const rows = [
    {
      StuID: "one",
      TotalScore: 410,
      DirectionName: "direction",
      XueYuanName: "college",
    },
    {
      StuID: "me",
      TotalScore: 390,
      DirectionName: "direction",
      XueYuanName: "college",
    },
    {
      StuID: "three",
      TotalScore: 380,
      DirectionName: "other",
      XueYuanName: "college",
    },
    {
      StuID: "four",
      TotalScore: 370,
      DirectionName: "direction",
      XueYuanName: "other",
    },
  ];
  assert.equal(adapter.scoreRankGroup(rows, form, "major", "me").count, 4);
  assert.equal(adapter.scoreRankGroup(rows, form, "direction", "me").count, 3);
  const college = adapter.scoreRankGroup(rows, form, "college", "me");
  assert.equal(college.count, 2);
  assert.equal(college.rank, 2);
  assert.equal(college.average, 400);
  assert.equal(college.highest, 410);
  assert.equal(adapter.scoreRankGroup([], form, "major", "me").rank, null);
});
test("rank names are masked and score distribution boundaries retain every returned record", () => {
  assert.equal(adapter.maskScoreName("张三丰"), "张**");
  assert.equal(adapter.maskScoreName("张"), "张");
  const bins = adapter.scoreDistribution([
    { TotalScore: 420 },
    { TotalScore: 410 },
    { TotalScore: 319 },
    { TotalScore: 0 },
  ]);
  assert.equal(bins[0].count, 1);
  assert.equal(bins[1].count, 1);
  assert.equal(bins[bins.length - 1].count, 2);
  assert.equal(
    bins.reduce((n, b) => n + b.count, 0),
    4,
  );
});
test("subject/rank queries preserve the original cscj hierarchy and fixed first-score route", async () => {
  let seen;
  globalThis.__scoreCommand = async (...args) => {
    seen = args;
    return { data: [[]] };
  };
  await adapter.scoreRankApi.subjects(form);
  assert.deepEqual(seen, [
    "GetMajorSubjectList_cscj",
    {
      SchoolCode: "school",
      XueYuanName: "college",
      MajorCode: "major",
      DirectionName: "direction",
      IsQuanRiZ: 1,
    },
  ]);
  globalThis.__scoreApi = async (...args) => {
    seen = args;
    return { msg: "操作成功" };
  };
  await adapter.scoreRankApi.save({ IsFinish: 0 });
  assert.equal(seen[0], "/api/platform/math/first-score");
  assert.deepEqual(JSON.parse(seen[1].body), { score: { IsFinish: 0 } });
  globalThis.__scoreApi = async () => ({ code: 403, msg: "权限不足" });
  await assert.rejects(adapter.scoreRankApi.save({}), /权限不足/);
});
