import test from "node:test";
import assert from "node:assert/strict";
import { loadBookNotes } from "../src/features/math/notebook/notebook-data.mjs";
test("all note categories use an actor-scoped list without the uncategorized filter", async () => {
  const calls = [];
  const result = await loadBookNotes({
    stuid: "fixture",
    kind: "笔记",
    get: async (path, query) => {
      calls.push([path, query]);
      return { data: [{ ID: 9, CatalogID: 12 }], count: 1 };
    },
    command: async () => ({ data: [[], [{ count: 3 }]] }),
  });
  assert.equal(result.data[0][0].ID, 9);
  assert.equal(result.data[1][0].count, 3);
  assert.equal(calls[0][1].StuID, "fixture");
  assert.equal(calls[0][1].Type, "笔记");
  assert.equal("CatalogID" in calls[0][1], false);
  assert.equal("BookID" in calls[0][1], false);
});
test("specific category retains the original joined source procedure", async () => {
  let call;
  const result = await loadBookNotes({
    stuid: "fixture",
    kind: "收藏",
    catalogId: 12,
    bookId: 34,
    get: async () => {
      throw new Error("unexpected generic list");
    },
    command: async (...args) => {
      call = args;
      return { data: [[{ ID: 9 }], []] };
    },
  });
  assert.equal(result.data[0][0].ID, 9);
  assert.deepEqual(call, [
    "GetSysUserBookQuestionList",
    {
      StuID: "fixture",
      Type: "收藏",
      System_Station_ID: 1,
      BookID: 34,
      CatalogID: 12,
    },
  ]);
});
test("all-category lookup preserves book filters and server pagination", async () => {
  const calls = [];
  const result = await loadBookNotes({
    stuid: "fixture",
    kind: "错题",
    bookId: 34,
    get: async (path, query) => {
      calls.push(query);
      return query.page === 1
        ? { data: [{ ID: 1 }], count: 2 }
        : { data: [{ ID: 2 }], count: 2 };
    },
    command: async () => ({ data: [[], []] }),
  });
  assert.deepEqual(
    result.data[0].map((r) => r.ID),
    [1, 2],
  );
  assert.deepEqual(
    calls.map((q) => [q.BookID, q.page]),
    [
      [34, 1],
      [34, 2],
    ],
  );
});
test("all-category notes preserve source question previews without reverting edited note fields", async () => {
  const scopes = [];
  const result = await loadBookNotes({
    stuid: "fixture",
    kind: "错题",
    get: async () => ({ data: [
      { ID: 9, CatalogID: 12, Content: "最新笔记" },
      { ID: 10, CatalogID: 12, Content: "" },
    ] }),
    command: async (_, params) => {
      scopes.push(params.CatalogID);
      return params.CatalogID === 0 ? { data: [[], [{ count: 3 }]] } : {
        data: [[
          { ID: 9, Content: "旧笔记", QuestionTxt: "题干九", bookName: "教材" },
          { ID: 10, QuestionTxt: "题干十" },
        ], []],
      };
    },
  });
  assert.deepEqual(scopes, [0, 12]);
  assert.equal(result.data[0][0].Content, "最新笔记");
  assert.equal(result.data[0][0].QuestionTxt, "题干九");
  assert.equal(result.data[0][1].QuestionTxt, "题干十");
  assert.equal(result.data[1][0].count, 3);
});
