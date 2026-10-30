import test from "node:test";
import assert from "node:assert/strict";
import { loadDiscussionPage } from "../../../src/features/math/community/discussion-data.mjs";
test("discussion reads comments and current reply counts without a separate personal engagement request", async () => {
  const calls = [];
  let query;
  const result = await loadDiscussionPage({
    qid: 12,
    stuid: "fixture",
    get: async (path, params) => {
      assert.equal(path, "/api/sys_comment/GetUser");
      query = params;
      return { data: [{ ID: 3, Count: 1, Txt: "existing comment" }] };
    },
    command: async (name, params) => {
      calls.push([name, params]);
      return { data: [[{ ID: 3, Count: 0 }]] };
    },
  });
  assert.equal(result.data[0].Count, 0);
  assert.equal(result.data[0].Txt, "existing comment");
  assert.deepEqual(query, { ID: 12, limit: 20, page: 1, SortDesc: "", StuID: "fixture" });
  assert.deepEqual(calls.map((call) => call[0]), ["GetCommentInfoByID_lt"]);
  assert.ok(calls.every((call) => Number(call[1].t) > 0));
});
test("comments removed at the source do not remain visible from a cached list", async () => {
  const result = await loadDiscussionPage({
    qid: 12,
    stuid: "fixture",
    get: async () => ({ data: [{ ID: 3 }] }),
    command: async () => ({ data: [[]] }),
  });
  assert.deepEqual(result.data, []);
});
test("empty discussion list does not fabricate detail requests", async () => {
  const calls = [];
  const result = await loadDiscussionPage({
    qid: 12,
    stuid: "fixture",
    get: async () => ({ data: null }),
    command: async (name) => {
      calls.push(name);
      return { data: [[]] };
    },
  });
  assert.deepEqual(result.data, []);
  assert.deepEqual(calls, []);
});
test("latest discussion browsing retains the requested page and limit", async () => {
  let query;
  const result = await loadDiscussionPage({
    qid: 12,
    stuid: "fixture",
    order: "new",
    page: 3,
    limit: 10,
    get: async (_path, params) => { query = params; return { data: [] }; },
    command: async () => { assert.fail("an empty page has no comment details to read"); },
  });
  assert.deepEqual(query, { ID: 12, page: 3, limit: 10, SortDesc: "1", StuID: "" });
  assert.deepEqual(result.data, []);
});
