import test from "node:test";
import assert from "node:assert/strict";
import {
  courseAlbumTree,
  courseAlbumWork,
  courseAlbumOperation,
  courseAlbumLog,
} from "../../../src/features/math/courses/course-album-model.mjs";
test("album work follows the parent group teacher flag and actual first child paper identity", () => {
  const content = [
    { ID: 1, PID: 0, Type: "作业", BusValue: 1 },
    { ID: 2, PID: 1, Type: "题目", BusID: 200 },
    { ID: 3, PID: 0, Type: "作业", BusValue: 0 },
    { ID: 4, PID: 3, Type: "题目", BusID: 400 },
  ];
  assert.equal(courseAlbumTree(content)[0].children[0].BusID, 200);
  const work = courseAlbumWork([{ ContentList: content }]);
  assert.equal(work.length, 2);
  assert.equal(work[0].isTeacher, true);
  const states = courseAlbumOperation(
    work,
    [{ BusID: 400, BusRelationID: 0, IsFinished: 1 }],
    [{ PaperID: 200, TeacherState: 0 }],
  );
  assert.deepEqual(states, { 200: 1, 400: 2 });
});
test("album reading logs retain exact course/product scope and update an existing position instead of making a new identity", () => {
  const context = { stuid: "s", CourseID: 10, CalendarID: 11, ProductID: 12 };
  assert.deepEqual(courseAlbumLog(context, 20, 21, 22), {
    Type: "章节",
    CatalogID: 21,
    AlbumID: 20,
    StuID: "s",
    BusID: 22,
    ProductID: 12,
    CourseID: 10,
  });
  assert.deepEqual(
    courseAlbumLog(
      context,
      20,
      21,
      23,
      { ID: 9 },
      Date.parse("2026-10-29T04:00:00Z"),
    ),
    {
      ID: 9,
      BusID: 23,
      AddTime: "2026-10-29 12:00:00",
      UpdateColumns: "ID,BusID,AddTime",
    },
  );
});
import { readFile } from "node:fs/promises";
import ts from "typescript";
globalThis.__courseAlbumFixture = {
  courseAlbumLog,
  courseAlbumOperation,
  courseAlbumWork,
  mathData: (r) => r.data ?? r.Data ?? r,
  mathRows: (r) => {
    const d = r?.data ?? r?.Data ?? r;
    return Array.isArray(d?.[0]) ? d[0] : Array.isArray(d) ? d : [];
  },
  mathApi: {
    albumCatalog: (...a) => globalThis.__albumCatalog(...a),
    albumItems: (...a) => globalThis.__albumItems(...a),
  },
  mathCommand: (...a) => globalThis.__albumCommand(...a),
  mathGet: (...a) => globalThis.__albumGet(...a),
  mathPost: (...a) => globalThis.__albumPost(...a),
};
const source = await readFile(
    new URL("../../../src/features/math/courses/math-course-album.ts", import.meta.url),
    "utf8",
  ),
  output = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(/import \{[^}]+\} from ['"][^'"]+['"];?/g, "");
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from("const {courseAlbumLog,courseAlbumOperation,courseAlbumWork,mathData,mathRows,mathApi,mathCommand,mathGet,mathPost}=globalThis.__courseAlbumFixture;" + output).toString("base64")}`
);
test("course album loads catalogue by AlbumID and chapter cache by CatalogID, retaining own course progress queries", async () => {
  const calls = [];
  globalThis.__albumCommand = async (...a) => {
    calls.push(["command", ...a]);
    return { data: [[]] };
  };
  globalThis.__albumGet = async (...a) => {
    calls.push(["get", ...a]);
    return { data: [] };
  };
  globalThis.__albumCatalog = async (...a) => {
    calls.push(["catalog", ...a]);
    return { data: [{ ID: 21 }] };
  };
  globalThis.__albumItems = async (...a) => {
    calls.push(["items", ...a]);
    return { data: [] };
  };
  const context = { stuid: "s", ProductID: 12, CourseID: 10, CalendarID: 11 };
  await adapter.courseAlbumApi.load(20, context);
  await adapter.courseAlbumApi.chapter(20, 21, context);
  assert.equal(calls.find((c) => c[0] === "catalog")[1], 20);
  assert.equal(calls.find((c) => c[0] === "items")[1], 21);
  assert.equal(calls.find((c) => c[0] === "get")[2].CourseID, 10);
  assert.equal(calls.find((c) => c[0] === "get")[2].ProductID, 12);
});

test("course album preserves returned catalogues and chapter text when progress or likes fail", async () => {
  globalThis.__albumCatalog = async () => ({ data: [{ ID: 21, Title: "返回目录" }] });
  globalThis.__albumItems = async () => ({ data: [{ ID: 22, ContentList: [{ Content: "返回正文" }] }] });
  globalThis.__albumGet = async () => { throw new Error("progress unavailable"); };
  globalThis.__albumCommand = async command => {
    if (command === "GetAlbumInfo") return { data: [{ Title: "返回专辑" }] };
    throw new Error("likes unavailable");
  };
  const context = { stuid: "s", ProductID: 12, CourseID: 10, CalendarID: 11 };
  const overview = await adapter.courseAlbumApi.load(20, context);
  assert.equal(overview.info.Title, "返回专辑");
  assert.equal(overview.catalogs[0].Title, "返回目录");
  assert.match(overview.errors.progress, /progress unavailable/);
  const chapter = await adapter.courseAlbumApi.chapter(20, 21, context);
  assert.equal(chapter.rows[0].ContentList[0].Content, "返回正文");
  assert.match(chapter.errors.log, /progress unavailable/);
  assert.match(chapter.errors.likes, /likes unavailable/);
  assert.equal(chapter.errors.content, undefined);
});

test("course album keeps successful auxiliary responses and reports a real content failure", async () => {
  globalThis.__albumItems = async () => { throw new Error("content unavailable"); };
  globalThis.__albumGet = async () => ({ data: [{ ID: 31, BusID: 32 }] });
  globalThis.__albumCommand = async () => ({ data: [{ Counts: 4 }] });
  const chapter = await adapter.courseAlbumApi.chapter(20, 21, { stuid: "s", ProductID: 12, CourseID: 10, CalendarID: 11 });
  assert.deepEqual(chapter.rows, []);
  assert.equal(chapter.log.ID, 31);
  assert.equal(chapter.likes.Counts, 4);
  assert.match(chapter.errors.content, /content unavailable/);
});
