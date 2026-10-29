import test from "node:test";
import assert from "node:assert/strict";
import {
  discussionGivePayload,
  discussionReplyPayload,
  discussionTree,
} from "../src/features/math/community/discussion-model.mjs";
test("discussion reply payload preserves original parent, reply and recipient semantics for each level", () => {
  const input = {
    qid: 99,
    stuid: "author",
    text: " 理解了 ",
    files: ["https://example.com/image.png"],
  };
  assert.deepEqual(discussionReplyPayload(input), {
    StuID: "author",
    Txt: "理解了",
    PID: 0,
    Level: 1,
    BusType: "题目讨论区",
    BusID: 99,
    System_Station_ID: 1,
    Files: "https://example.com/image.png",
    Quote: "",
    ReplyID: 0,
  });
  const second = discussionReplyPayload({
    ...input,
    target: { ID: 10, Level: 1, StuID: "recipient" },
  });
  assert.equal(second.PID, 10);
  assert.equal(second.Level, 2);
  assert.equal(second.Quote, "recipient");
  const third = discussionReplyPayload({
    ...input,
    target: { ID: 20, PID: 10, Level: 2 },
  });
  assert.equal(third.PID, 20);
  assert.equal(third.Level, 3);
  const nested = discussionReplyPayload({
    ...input,
    target: { ID: 30, PID: 20, Level: 3 },
  });
  assert.equal(nested.PID, 20);
  assert.equal(nested.ReplyID, 30);
});
test("flat source reply rows form the intended nested conversation without mutating upstream rows", () => {
  const rows = [
    { ID: 20, PID: 10 },
    { ID: 30, PID: 20 },
    { ID: 21, PID: 10 },
  ];
  const tree = discussionTree(rows, 10);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].children[0].ID, 30);
  assert.equal(rows[0].children, undefined);
});
test("liking identifies the recipient author while cancellation uses only the original comment ID", () => {
  assert.deepEqual(
    discussionGivePayload({ ID: 5, StuID: "recipient" }, false),
    { ID: 5, Give: 1, StuID: "recipient" },
  );
  assert.deepEqual(discussionGivePayload({ ID: 5, StuID: "recipient" }, true), {
    ID: 5,
    Give: -1,
  });
});
