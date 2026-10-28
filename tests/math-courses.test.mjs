import test from "node:test";
import assert from "node:assert/strict";
import {
  durationSeconds,
  calendarFinished,
  taskType,
  videoProgressRecord,
  leakPaperState,
} from "../src/components/math/course-model.mjs";
test("course duration parses the source HH:mm:ss representation", () => {
  assert.equal(durationSeconds("01:02:03"), 3723);
  assert.equal(durationSeconds("04:30"), 270);
  assert.equal(durationSeconds("invalid"), 0);
});
test("calendar completion uses upstream progression rather than merely viewed content", () => {
  assert.equal(
    calendarFinished({
      c_course_users_progressList: [{ IsFinished: 0 }],
      c_course_users_recordList: [{ IsFinished: 1 }],
    }),
    false,
  );
  assert.equal(
    calendarFinished({ c_course_users_progressList: [{ IsFinished: 1 }] }),
    true,
  );
});
test("video progress keeps record identity and completion threshold from the source", () => {
  const context = {
      StuID: "student",
      CourseID: 12,
      CalendarID: 34,
      ProductID: 56,
    },
    task = { BusID: 78 };
  assert.deepEqual(
    videoProgressRecord(context, task, 86, 100, { ID: 9, BusValue: 40 }),
    { ID: 9, ...context, BusType: 2, BusID: 78, BusValue: 86, IsFinished: 1 },
  );
  assert.equal(
    videoProgressRecord(context, task, 50, 100, {
      ID: 9,
      BusValue: 86,
      IsFinished: 1,
    }).BusValue,
    86,
  );
  assert.equal(videoProgressRecord(context, task, 85, 100).IsFinished, 0);
  assert.equal(taskType({ BusType: 6 }), "测评");
});

test("calendar exams retain the original required entry and exit completion records", () => {
  const calendar = {
    c_course_users_progressList: [{ IsFinished: 1 }],
    c_course_calendar_detailList: [{ BusType: 3 }, { BusType: 4 }],
    c_course_users_recordList: Array.from({ length: 5 }, () => ({
      BusRelationID: 0,
      IsFinished: 1,
    })),
  };
  assert.equal(calendarFinished(calendar), false);
  calendar.c_course_users_recordList.push({ BusRelationID: 0, IsFinished: 1 });
  assert.equal(calendarFinished(calendar), true);
});

test("gap review blocks the next paper until grading and assigned training are finished", () => {
  assert.equal(leakPaperState({}), 0);
  assert.equal(leakPaperState({ _c_paper_student: { StuState: 0 } }), 1);
  assert.equal(
    leakPaperState({ _c_paper_student: { StuState: 1, TeacherState: 0 } }),
    2,
  );
  assert.equal(
    leakPaperState({ _c_paper_student: { StuState: 1, TeacherState: 1 } }, 3),
    3,
  );
  assert.equal(
    leakPaperState({ _c_paper_student: { StuState: 1, TeacherState: 1 } }, 0),
    4,
  );
});

import {
  courseMinutes,
  packetAuthorization,
  completedCourseAssignments,
  courseResumeTarget,
  packetResumeEntry,
  courseAccessError,
} from "../src/components/math/course-model.mjs";
test("third generation chapter authorization follows FunctionID and cannot be bypassed by a descendant", () => {
  const rows = [
    { ID: 1, PID: "" },
    { ID: 2, PID: 1 },
    { ID: 3, PID: 2 },
    { ID: 4, PID: 3, CourseID: 50 },
    { ID: 5, PID: 2 },
    { ID: 6, PID: 5, CourseID: 60 },
  ];
  const granted = packetAuthorization(rows, 2633, [{ FunctionID: 3 }]);
  assert.equal(granted.find((r) => r.ID === 3).hasAuth, true);
  assert.equal(granted.find((r) => r.ID === 4).hasAuth, true);
  assert.equal(granted.find((r) => r.ID === 5).hasAuth, false);
  assert.equal(granted.find((r) => r.ID === 6).hasAuth, false);
  assert.equal(granted.find((r) => r.ID === 6)._authChapterID, 5);
  assert.equal(
    packetAuthorization(rows, 99, []).every((r) => r.hasAuth),
    true,
  );
});
test("course continuation reads the latest actual row and original mini-program route without opening its URL", () => {
  const target = courseResumeTarget([
    [
      {
        ProductID: 9,
        CourseID: 10,
        CalendarID: 11,
        AddTime: "2026-01-01 00:00:00",
      },
    ],
    [
      {
        ProductID: 9,
        AddTime: "2026-01-02 00:00:00",
        Json: "/course/pages/Video/Video?courseID=20&calendarID=21&vid=22&productid=9",
      },
    ],
  ]);
  assert.equal(target.CourseID, "20");
  assert.equal(target.CalendarID, "21");
  assert.equal(target.BusID, "22");
  assert.equal(courseResumeTarget([]), undefined);
  assert.equal(
    courseResumeTarget([
      { Json: "https://example.com/?courseID=123&productid=9" },
    ]),
    undefined,
  );
  const found = packetResumeEntry(
    [{ ID: 30, _c_course_packet: [{ ID: 40, CourseID: 50 }] }],
    { CourseID2: 40 },
  );
  assert.equal(found.entry.CourseID, 50);
  assert.equal(packetResumeEntry([], {}), undefined);
});
test("completed assignment summary distinguishes teacher publication and finished self-scoring and preserves zero scores", () => {
  const tasks = [
    {
      CourseID: 1,
      CalendarID: 2,
      ProductID: 3,
      _book_highscorealbum: { Title: "第一章" },
      _book_highscorealbum_catalog_content: [
        {
          ID: 1,
          BusID: 10,
          BusValue: 1,
          _c_paper_student: { TeacherState: 1, Score: 0 },
        },
        {
          ID: 2,
          BusID: 20,
          BusValue: 1,
          _c_paper_student: { TeacherState: 0, Score: 100 },
        },
        {
          ID: 3,
          BusID: 30,
          BusValue: 0,
          _c_course_users_record: [
            { BusRelationID: 0, IsFinished: 1, BusValue: 90 },
          ],
        },
        {
          ID: 4,
          BusID: 40,
          BusValue: 0,
          _c_course_users_record: [
            { BusRelationID: 99, IsFinished: 1, BusValue: 100 },
          ],
        },
      ],
    },
  ];
  const result = completedCourseAssignments(tasks);
  assert.equal(result.total, 4);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].Score, 0);
  assert.equal(result.rows[0].BusType, 6);
  assert.equal(result.rows[1].Score, 90);
  assert.equal(result.rows[1].CalendarID, 2);
});
test("course durations display seconds as minutes and original product availability dates remain enforced", () => {
  assert.equal(courseMinutes(5400), 90);
  assert.equal(courseMinutes(0), 0);
  const now = Date.parse("2026-10-29T04:00:00Z");
  assert.match(
    courseAccessError({ StateaTime: "2026-10-30 00:00:00" }, now),
    /尚未开始/,
  );
  assert.match(
    courseAccessError({ EndTime: "2026-10-29 11:00:00" }, now),
    /已结束/,
  );
  assert.equal(
    courseAccessError(
      { StateaTime: "0001-01-01T00:00:00", EndTime: "1900-01-01 00:00:00" },
      now,
    ),
    "",
  );
});

import {
  courseTasksFinished,
  packetVisitRecord,
} from "../src/components/math/course-model.mjs";
test("packet continuation writes the original packet progress type and verifies previous single-task completion", () => {
  assert.deepEqual(
    packetVisitRecord(
      "s",
      10,
      20,
      { CourseID: 30 },
      Date.parse("2026-10-29T04:00:00Z"),
    ),
    {
      CourseID: 30,
      StuID: "s",
      BusType: 3,
      BusID: 20,
      IsFinished: 0,
      ProductID: 10,
      AddTime: "2026-10-29 12:00:00",
    },
  );
  assert.equal(
    courseTasksFinished([
      { BusType: 1, _record: [{ ID: 1 }] },
      { BusType: 2, _record: [{ IsFinished: 1 }] },
    ]),
    true,
  );
  assert.equal(
    courseTasksFinished([
      { BusType: 6, _c_paper_student: { StuState: 1, TeacherState: 0 } },
    ]),
    false,
  );
  assert.equal(
    courseTasksFinished([
      { BusType: 3, _record: [{ IsFinished: 1, BusRelationID: 0 }] },
    ]),
    false,
  );
  assert.equal(
    courseTasksFinished([
      {
        BusType: 3,
        _record: [
          { IsFinished: 1, BusRelationID: 0 },
          { ID: 8, BusRelationID: 9 },
        ],
      },
    ]),
    true,
  );
});

import { readFile } from "node:fs/promises";
import ts from "typescript";
globalThis.__courseFixture = {
  freeCourseClaim,
  mathCommand: (...args) => globalThis.__courseCommand(...args),
  mathGet: (...args) => globalThis.__courseGet(...args),
  mathPost: (...args) => globalThis.__coursePost(...args),
};
const courseSource = await readFile(
    new URL("../src/components/math/math-courses.ts", import.meta.url),
    "utf8",
  ),
  courseOutput = ts
    .transpileModule(courseSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(/import \{[^}]+\} from ['"][^'"]+['"];?/g, "");
const courseAdapter = await import(
  `data:text/javascript;base64,${Buffer.from("const {freeCourseClaim,mathCommand,mathGet,mathPost}=globalThis.__courseFixture;" + courseOutput).toString("base64")}`
);
test("chapter entitlement uses Model while original resume and history queries keep their scopes", async () => {
  const calls = [];
  globalThis.__courseCommand = async (...args) => {
    calls.push(args);
    return { data: [[]] };
  };
  await courseAdapter.courseApi.chapterAuth("s");
  await courseAdapter.courseApi.packetLast("s", 10, 20);
  await courseAdapter.courseApi.last("s", 10, 20, 30);
  await courseAdapter.courseApi.history("s", 40, 3);
  assert.deepEqual(calls, [
    ["GetSysUser3ChapterAuthList", { StuID: "s", System_Station_ID: 1 }, true],
    [
      "GetCoursePacketLastStudy",
      { StuID: "s", ProductID: 10, CoursePacketID: 20 },
    ],
    [
      "GetProductLastTimeLog",
      { StuID: "s", ProductID: 10, CoursePacketID: 20, ChapterID: 30 },
    ],
    [
      "GetCourseThrillerPaperList",
      { StuID: "s", CourseID: 40, BusType: 3, System_Station_ID: 1 },
    ],
  ]);
});

import {
  zeroPriceCourse,
  freeCourseClaim,
  courseVipActive,
} from "../src/components/math/course-model.mjs";
test("zero-price course activation requires both actual price fields while member courses retain their separate gate", () => {
  assert.equal(zeroPriceCourse({}), false);
  assert.equal(zeroPriceCourse({ Proce: false, DiscountPrice: false }), false);
  assert.equal(zeroPriceCourse({ Proce: null, DiscountPrice: null }), false);
  assert.equal(zeroPriceCourse({ Proce: 0 }), false);
  assert.equal(zeroPriceCourse({ Proce: "", DiscountPrice: "" }), false);
  assert.equal(zeroPriceCourse({ Proce: 0, DiscountPrice: 0 }), true);
  assert.equal(zeroPriceCourse({ Proce: "0", DiscountPrice: "0" }), true);
  assert.equal(zeroPriceCourse({ Proce: 100, DiscountPrice: 0 }), false);
  assert.equal(
    courseVipActive(
      { VipEndTime: "2026-10-29 13:00:00" },
      Date.parse("2026-10-29T04:00:00Z"),
    ),
    true,
  );
  assert.deepEqual(
    freeCourseClaim("s", 10, Date.parse("2026-10-29T04:00:00Z")),
    {
      CourseProductID: 10,
      StuID: "s",
      Source: "系统支付开通",
      Room: "系统开通202610",
      System_Station_ID: 1,
    },
  );
});
test("course catalogues only read and activation retains the two original non-payment contracts", async () => {
  const calls = [];
  globalThis.__courseGet = async (...args) => {
    calls.push(["get", ...args]);
    return { data: [] };
  };
  globalThis.__courseCommand = async (...args) => {
    calls.push(["command", ...args]);
    return { data: [[]] };
  };
  globalThis.__coursePost = async (...args) => {
    calls.push(["post", ...args]);
    return { msg: "操作成功" };
  };
  await courseAdapter.courseApi.catalog("s");
  await courseAdapter.courseApi.vipCatalog();
  assert.equal(
    calls.some((c) => c[0] === "post"),
    false,
  );
  await courseAdapter.courseApi.claim("s", 10);
  await courseAdapter.courseApi.freeClaim("s", 11);
  assert.deepEqual(calls[0], [
    "get",
    "/api/c_course_product/GetProductByStuID2",
    {
      StuID: "s",
      System_Station_ID: 1,
      BusType: "",
      SortDesc: "Sort",
      IsRecommend: 1,
    },
  ]);
  assert.equal(calls[1][1], "GetCourseProductRecordCounts");
  assert.deepEqual(calls[2], [
    "post",
    "/api/c_course_product/VIPProductByStuid",
    { StuID: "s", CourseProductID: 10 },
  ]);
  assert.equal(calls[3][1], "/api/c_course_users/Inner_c_course_users");
  assert.equal(calls[3][2].CourseProductID, 11);
  assert.equal(calls[3][2].Source, "系统支付开通");
});

import { courseQuestionRecord } from "../src/components/math/course-model.mjs";
test("standalone calendar questions retain their original relation ID and answer-only update contract", () => {
  const context = { StuID: "s", CourseID: 10, CalendarID: 20, ProductID: 30 },
    task = { BusID: 44, Data: { ID: 44, BookID: 55 } };
  assert.deepEqual(courseQuestionRecord(context, task, "101,102"), {
    ...context,
    BusType: 1,
    BusID: 0,
    BusRelationID: 44,
    BookID: 55,
    IsFinished: 1,
    Answer: "101,102",
    BusValue: "",
  });
  assert.deepEqual(courseQuestionRecord(context, task, 2, { ID: 66 }), {
    ...context,
    BusType: 1,
    BusID: 0,
    BusRelationID: 44,
    BookID: 55,
    IsFinished: 1,
    Answer: 2,
    BusValue: "",
    ID: 66,
    UpdateColumns: "ID,Answer",
  });
});
