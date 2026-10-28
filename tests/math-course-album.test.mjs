import test from "node:test";
import assert from "node:assert/strict";
import {
  courseAlbumAllowed,
  courseAlbumTree,
  courseAlbumWork,
  courseAlbumOperation,
  courseAlbumLog,
  courseAlbumFeedback,
} from "../src/components/math/course-album-model.mjs";
test("course album preserves the source single-chapter direct route and checks multi-chapter membership or free term", () => {
  const now = Date.parse("2026-10-29T04:00:00Z");
  assert.equal(courseAlbumAllowed({ Authority: 2 }, {}, 1, now), true);
  assert.equal(courseAlbumAllowed({ Authority: 2 }, {}, 2, now), false);
  assert.equal(
    courseAlbumAllowed(
      { Authority: 1, FreeEndTime: "2026-10-30 00:00:00" },
      {},
      2,
      now,
    ),
    true,
  );
  assert.equal(
    courseAlbumAllowed(
      { Authority: 1, FreeEndTime: "2026-10-28 00:00:00" },
      {},
      2,
      now,
    ),
    false,
  );
  assert.equal(
    courseAlbumAllowed(
      { Authority: 2 },
      { VipEndTime: "2027-01-01 00:00:00" },
      2,
      now,
    ),
    true,
  );
});
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
    System_Station_ID: 1,
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
test("album feedback uses the original album record type and context rather than a question feedback payload", () => {
  assert.deepEqual(
    courseAlbumFeedback(
      { stuid: "s" },
      20,
      21,
      ["视频出错"],
      "画面无法正常播放",
      ["https://example.com/evidence.png"],
    ),
    {
      BusType: 8,
      Type: 3,
      StuID: "s",
      BusID: 21,
      BusValue: "视频出错",
      Content: "画面无法正常播放",
      System_Station_ID: 1,
      BusNumber: 0,
      Notes: "https://example.com/evidence.png",
      BaseType: "专辑反馈",
      BusParms: "AlbumID=20&CatalogID=21",
    },
  );
  assert.throws(
    () => courseAlbumFeedback({ stuid: "s" }, 20, 21, [], "说明", []),
    /错误类型/,
  );
});

import { readFile } from "node:fs/promises";
import ts from "typescript";
globalThis.__courseAlbumFixture = {
  courseAlbumFeedback,
  courseAlbumLog,
  courseAlbumOperation,
  courseAlbumWork,
  mathData: (r) => r.data ?? r.Data ?? r,
  mathRows: (r) => {
    const d = r.data ?? r.Data ?? r;
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
    new URL("../src/components/math/math-course-album.ts", import.meta.url),
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
  `data:text/javascript;base64,${Buffer.from("const {courseAlbumFeedback,courseAlbumLog,courseAlbumOperation,courseAlbumWork,mathData,mathRows,mathApi,mathCommand,mathGet,mathPost}=globalThis.__courseAlbumFixture;" + output).toString("base64")}`
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
