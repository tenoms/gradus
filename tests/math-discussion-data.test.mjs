import test from "node:test";
import assert from "node:assert/strict";
import { loadDiscussionPage } from "../src/features/math/community/discussion-data.mjs";
test("discussion reads current zero likes instead of the stale GetUser counter", async () => {
  const calls = [];
  const result = await loadDiscussionPage({
    qid: 12,
    stuid: "fixture",
    get: async () => ({ data: [{ ID: 3, Give: 1, Txt: "own fixture" }] }),
    command: async (name, params) => {
      calls.push([name, params]);
      return name === "GetCommentInfoByID_lt"
        ? { data: [[{ ID: 3, Give: 0 }]] }
        : { data: [[]] };
    },
  });
  assert.equal(result[0].data[0].Give, 0);
  assert.equal(result[0].data[0].Txt, "own fixture");
  assert.equal(calls[0][1].StuID, "fixture");
  assert.ok(calls.every((call) => Number(call[1].t) > 0));
});
test("successfully deleted comments do not remain visible from a cached list", async () => {
  const result = await loadDiscussionPage({
    qid: 12,
    stuid: "fixture",
    get: async () => ({ data: [{ ID: 3, Give: 1 }] }),
    command: async () => ({ data: [[]] }),
  });
  assert.deepEqual(result[0].data, []);
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
  assert.deepEqual(result[0].data, []);
  assert.deepEqual(calls, ["GetUserCommentGiveList_lt"]);
});
