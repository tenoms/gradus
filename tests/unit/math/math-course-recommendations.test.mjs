import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as model from "../../../src/features/math/courses/course-recommendations-model.mjs";

const context = {
  stuid: "student",
  PaperID: 101,
  CourseID: 202,
  CalendarID: 303,
  ProductID: 404,
};
const choice = {
  QuestionID: 1,
  LinkSort: 5,
  AddPerson: "专题一",
  AddTime: "2026-10-29 10:00:00",
  _question_list: { BookID: 7 },
  options: [
    { ID: 11, IsAnswer: 1 },
    { ID: 12, IsAnswer: 0 },
    { ID: 13, IsAnswer: 1 },
  ],
};
const rows = (response) => {
  const data = response?.data ?? response;
  return Array.isArray(data) ? (Array.isArray(data[0]) ? data[0] : data) : [];
};
globalThis.__recommendFixture = {
  mathCommand: (...args) => globalThis.__recommendCommand(...args),
  mathGet: (...args) => globalThis.__recommendGet(...args),
  mathPost: (...args) => globalThis.__recommendPost(...args),
  mathData: (r) => r?.data ?? r,
  mathRows: rows,
};
globalThis.__recommendModel = model;
const source = await readFile(
  new URL(
    "../../../src/features/math/courses/math-course-recommendations.ts",
    import.meta.url,
  ),
  "utf8",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /import \{([^}]+)\} from ['"]\.\.\/api\/math['"];?/,
    (_, names) => `const {${names}}=globalThis.__recommendFixture;`,
  )
  .replace(
    /import \{([^}]+)\} from ['"]\.\/course-recommendations-model\.mjs['"];?/,
    (_, names) => `const {${names}}=globalThis.__recommendModel;`,
  );
const { recommendationApi: api, teacherRecommendationApi: teacherApi } =
  await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );

test("LinkSort grouping joins string and numeric identities, ignores unrelated rows and counts saved right/wrong records", () => {
  const groups = model.recommendationGroups([
    { ...choice, _c_course_users_record: { ID: 8, AnswerState: 1 } },
    {
      ...choice,
      QuestionID: 2,
      LinkSort: "5",
      _c_course_users_record: { ID: 9, AnswerState: 0 },
    },
    { ...choice, QuestionID: 3, LinkSort: 0 },
    { ...choice, QuestionID: 4, LinkSort: 6 },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].data.length, 2);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].correct, 1);
  assert.equal(groups[0].isFinish, true);
  assert.equal(groups[1].isFinish, false);
  assert.equal(
    model.recommendationRecordComplete({
      _c_course_users_record: { ID: 0, AnswerState: 1 },
    }),
    false,
  );
});
test("recommendation materials and additional topics join actual original question/topic relations", () => {
  const groups = model.recommendationGroups([choice]),
    result = model.recommendationMetadata(
      groups,
      {
        specialList: [
          {
            ID: 5,
            Name: "已有专题",
            BusValue: 3,
            Type: 2,
            Files: "https://fixture.invalid/handout.pdf",
          },
          { ID: 6, Name: "新专题", BusValue: 4, Type: 3 },
        ],
        QuestionListFiles: [
          { QuestionID: 81, BusID: 5 },
          { QuestionID: 81, BusID: 6 },
        ],
      },
      [{ QuestionID: 81, _c_course_users_record: { ID: 9, AnswerState: 0 } }],
    );
  assert.equal(result.groups[0].ND, "三星");
  assert.equal(result.groups[0].KP, "中");
  assert.match(result.groups[0].SpecialFiles, /handout/);
  assert.equal(result.topics[0].specialList[0].existing, true);
  assert.equal(result.topics[0].specialList[1].existing, false);
});
test("recommendation answers retain BusType3 identities and use mastery states instead of ordinary exam points", () => {
  const record = model.buildRecommendationRecord(
    context,
    { ...choice, _c_course_users_record: { ID: 8 } },
    "13,11",
  );
  assert.equal(record.ID, 8);
  assert.equal(record.BusType, 3);
  assert.equal(record.BusID, 101);
  assert.equal(record.BusRelationID, 1);
  assert.equal(record.CalendarID, 303);
  assert.equal(record.ProductID, 404);
  assert.equal(record.BookID, 7);
  assert.equal(record.Answer, "13,11");
  assert.equal(record.AnswerState, 1);
  assert.equal(record.BusValue, 0);
  assert.equal(
    model.buildRecommendationRecord(context, choice, "11").AnswerState,
    0,
  );
  assert.equal(
    model.buildRecommendationRecord(context, choice, "").AnswerState,
    0,
  );
  const self = model.buildRecommendationRecord(
    context,
    {
      QuestionID: 2,
      _question_list: { BookID: 7 },
      _c_course_users_record: { ID: 9, BusValue: "" },
    },
    "",
    1,
  );
  assert.equal(self.ID, 9);
  assert.equal(self.AnswerState, 1);
  assert.equal(self.BusValue, "");
  assert.equal(self.Answer, "");
});
test("completion is a separate whole-paper record and append keeps source ordinary/super contracts", () => {
  assert.deepEqual(model.recommendationCompletion(context), {
    ID: 0,
    StuID: "student",
    CourseID: 202,
    CalendarID: 303,
    BusType: 3,
    BusID: 101,
    BusValue: 0,
    AnswerState: 1,
    BusRelationID: 0,
    IsFinished: 1,
    ProductID: 404,
  });
  const append = model.recommendationAppend(context, { RelatedID: 55 }, 6);
  assert.equal(append.ID, 55);
  assert.equal(append.PaperID, 101);
  assert.equal(append.RelatedStuID, "student");
  assert.equal(append.Links, 6);
  assert.equal(append.ProductID, 404);
  assert.equal(
    model.recommendationAppend(
      { ...context, isSuper: true },
      { RelatedID: 55 },
      6,
    ).ProductID,
    undefined,
  );
  assert.throws(() => model.recommendationAppend(context, {}, 6), /关联/);
  assert.throws(
    () => model.recommendationAppend(context, { RelatedID: 55 }, ""),
    /专题/,
  );
});
test("save/update and resolve preserve upstream IDs, selected option IDs and rich question parts", () => {
  assert.equal(model.recommendationSavedRecord({ ID: 8 }, "修改成功").ID, 8);
  assert.equal(model.recommendationSavedRecord({ ID: 0 }, "19").ID, 19);
  assert.equal(model.recommendationSavedRecord({ ID: 0 }, "操作成功").ID, 0);
  const resolved = model.recommendationResolve(choice, [
    { Type: "题干", Content: "stem" },
    { ID: 11, Type: "选项", IsAnswer: 1 },
    { ID: 13, Type: "选项", IsAnswer: 1 },
    { Type: "解题步骤", Content: "solution" },
  ]);
  assert.equal(resolved.QuestionType, "多选题");
  assert.equal(resolved.stems.length, 1);
  assert.equal(resolved.options.length, 2);
  assert.equal(resolved.solutions.length, 1);
  const updated = model.recommendationUpdate(
    [choice, { ...choice, QuestionID: 2 }],
    1,
    { ID: 20, AnswerState: 1 },
  );
  assert.equal(updated[0]._c_course_users_record.ID, 20);
  assert.equal(updated[1]._c_course_users_record, undefined);
});
test("print link prioritizes returned files and otherwise uses only the exact source host/path and five parameters", () => {
  assert.equal(
    model.recommendationPrintUrl(context, {
      LinkSort: 5,
      Files: "https://fixture.invalid/paper.pdf",
    }),
    "https://fixture.invalid/paper.pdf",
  );
  const url = new URL(
    model.recommendationPrintUrl(context, {
      LinkSort: 5,
      Files: "javascript:alert(1)",
    }),
  );
  assert.equal(url.origin, "https://web.math-upstream.invalid");
  assert.equal(url.pathname, "/External/RecommendPaperPrintSpecial.html");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    courseID: "202",
    calendarID: "303",
    PaperID: "101",
    StuID: "student",
    LinkSort: "5",
  });
  assert.equal(url.searchParams.has("ProductID"), false);
});
test("load reads existing paper and questions without appending or writing study records", async () => {
  const calls = [];
  globalThis.__recommendGet = async (path, query) => {
    calls.push({ path, query });
    return {
      data: path.endsWith("/GetListByAll")
        ? [{ ID: 101, RelatedID: 55 }]
        : [choice],
    };
  };
  const result = await api.load(context);
  assert.equal(result.meta.RelatedID, 55);
  assert.equal(result.questions.length, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].query, {
    PaperID: 101,
    StuID: "student",
    CalendarID: 303,
    ProductID: 404,
  });
});
test("topic metadata uses source POST and super AutoModel command without creating practice questions", async () => {
  const calls = [];
  globalThis.__recommendPost = async (path, data) => {
    calls.push({ path, data });
    return { data: { specialList: [{ ID: 5 }], QuestionListFiles: [] } };
  };
  globalThis.__recommendGet = async (path, query) => {
    calls.push({ path, query });
    return { data: [choice] };
  };
  globalThis.__recommendCommand = async (command, data) => {
    calls.push({ command, data });
    return { data: [[{ ID: 5, Files: "https://fixture.invalid/super.pdf" }]] };
  };
  const result = await api.details(context, { RelatedID: 55 });
  assert.equal(result.original.length, 1);
  assert.equal(calls[0].path, "/api/c_paper/RelPaperByStuBySpecial2");
  assert.equal(calls[0].data.ID, 55);
  assert.equal(calls[1].query.PaperID, 55);
  assert.equal(
    calls.some((c) => c.path?.includes("RelPaperByStuID1")),
    false,
  );
  calls.length = 0;
  const superResult = await api.details(
    { ...context, isSuper: true },
    { RelatedID: 55 },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "GetSuperSpecialList");
  assert.equal(superResult.info.length, 1);
});
test("completion saves the actual whole-paper study record without requesting a content unlock", async () => {
  const calls = [];
  globalThis.__recommendPost = async (path, data) => { calls.push({ path, data }); return { data: 9 }; };
  const result = await api.complete(context);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/c_course_users_record/Inner_c_course_users_record");
  assert.equal(calls[0].data.IsFinished, 1);
  assert.equal(result.data, 9);
});
test("ordinary and super append use the matching source endpoint and user-selected single topic", async () => {
  const calls = [];
  globalThis.__recommendPost = async (path, data) => {
    calls.push({ path, data });
    return { data: 1 };
  };
  await api.append(context, { RelatedID: 55 }, 6);
  await api.append({ ...context, isSuper: true }, { RelatedID: 55 }, 7);
  assert.equal(calls[0].path, "/api/c_paper/RelPaperByStuID1");
  assert.equal(calls[0].data.Links, 6);
  assert.equal(calls[1].path, "/api/c_paper/RelPaperByStuIDCJZT");
  assert.equal(calls[1].data.Links, 7);
  assert.equal(calls[1].data.ProductID, undefined);
});

test("teacher recommendation follows the source QuestionID then GroupKey chain and excludes the origin question", async () => {
  const calls = [];
  globalThis.__recommendGet = async (path, query) => {
    calls.push({ path, query });
    return {
      data: query.QuestionID
        ? [{ QuestionID: 91, GroupKey: "teacher-group" }]
        : [{ QuestionID: 91 }, { QuestionID: 92 }, { QuestionID: 93 }],
    };
  };
  const result = await teacherApi.load(91);
  assert.equal(result.GroupKey, "teacher-group");
  assert.deepEqual(
    result.questions.map((q) => q.QuestionID),
    [92, 93],
  );
  assert.deepEqual(calls[0], {
    path: "/api/question_groups/GetListByPage",
    query: { QuestionID: 91, limit: 1000, page: 1, SortDesc: "Sort" },
  });
  assert.deepEqual(calls[1], {
    path: "/api/question_groups/GetListByPage",
    query: {
      GroupKey: "teacher-group",
      limit: 1000,
      page: 1,
      SortDesc: "Sort",
    },
  });
});
test("a teacher question without a source group never broadens into all question groups", async () => {
  const calls = [];
  globalThis.__recommendGet = async (path, query) => {
    calls.push({ path, query });
    return { data: [] };
  };
  const result = await teacherApi.load(91);
  assert.deepEqual(result, { GroupKey: "", questions: [] });
  assert.equal(calls.length, 1);
});
test("teacher feedback uses its own BusType1 contract and preserves the original course/paper/question context", () => {
  const result = model.teacherRecommendationRecord(
    context,
    { QuestionID: 92, _question_list: { BookID: 7 } },
    { ID: 0 },
    1,
  );
  assert.deepEqual(result, {
    ID: 0,
    StuID: "student",
    CourseID: 202,
    CalendarID: 303,
    BusType: 1,
    BusID: 101,
    BusValue: "",
    AnswerState: 1,
    BusRelationID: 92,
    ProductID: 404,
    BookID: 7,
  });
  assert.equal(result.IsFinished, undefined);
  assert.equal(result.Score, undefined);
  assert.equal(result.Links, undefined);
  assert.equal(
    model.teacherRecommendationRecord(
      context,
      { QuestionID: 92 },
      { ID: 8, BusValue: "" },
      0,
    ).ID,
    8,
  );
});
test("teacher feedback reads exact per-question records and only creates a first response without unlock or paper creation", async () => {
  const gets = [],
    posts = [];
  globalThis.__recommendGet = async (path, query) => {
    gets.push({ path, query });
    return { data: [] };
  };
  globalThis.__recommendPost = async (path, data) => {
    posts.push({ path, data });
    return { data: 99 };
  };
  await teacherApi.record(context, 92);
  assert.deepEqual(gets[0], {
    path: "/api/c_course_users_record/GetListByAll",
    query: {
      StuID: "student",
      CourseID: 202,
      CalendarID: 303,
      BusType: 1,
      BusID: 101,
      BusRelationID: 92,
      ProductID: 404,
    },
  });
  const payload = model.teacherRecommendationRecord(
    context,
    { QuestionID: 92 },
    { ID: 0 },
    0,
  );
  const result = await teacherApi.save(payload);
  assert.equal(result.ID, 99);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].data.BusType, 1);
  assert.equal(
    posts[0].path,
    "/api/c_course_users_record/Inner_c_course_users_record",
  );
  await assert.rejects(teacherApi.save({ ...payload, ID: 99 }), /已有/);
  assert.equal(posts.length, 1);
});
