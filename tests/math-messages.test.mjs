import test from "node:test";
import assert from "node:assert/strict";
import { mathMessageTarget } from "../src/features/math/community/math-messages.ts";
test("learning message targets preserve original question and order IDs", () => {
  assert.deepEqual(
    mathMessageTarget({ BusType: "题目报错", BusRelationID: 25 }),
    { kind: "question", id: "25" },
  );
  assert.deepEqual(
    mathMessageTarget({
      BusValue: "wenda/pages/question/info?qid=12&orderid=34",
    }),
    { kind: "qa", id: "34", qid: "12" },
  );
  assert.deepEqual(
    mathMessageTarget({ BusValue: "/topic/pages/topic?courseID=55" }),
    { kind: "question", id: "55" },
  );
  assert.equal(
    mathMessageTarget({ BusValue: "javascript:alert(1)" }),
    undefined,
  );
});
