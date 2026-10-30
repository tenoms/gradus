import test from "node:test";
import assert from "node:assert/strict";
import { mathMessageTarget } from "../../../src/features/math/community/math-messages.ts";
test("learning message targets preserve original question IDs", () => {
  assert.deepEqual(
    mathMessageTarget({ BusType: "题目报错", BusRelationID: 25 }),
    { kind: "question", id: "25" },
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

test("removed teacher QA messages cannot link to the old answer desk or external workflow", () => {
  for (const row of [
    { BusValue: "wenda/pages/question/info?qid=12&orderid=34" },
    { BusValue: "https://example.test/wenda/pages/question/info?qid=12&orderid=34" },
    { BusType: "答疑回复", BusValue: "https://example.test/answer" },
  ]) assert.equal(mathMessageTarget(row), undefined);
  assert.deepEqual(mathMessageTarget({ BusType: "讨论回复" }), {
    kind: "route", path: "/study/community", label: "查看收到的讨论回复",
  });
  assert.deepEqual(mathMessageTarget({ BusType: "阅卷完毕通知" }), {
    kind: "route", path: "/study/exams", label: "查看我的考试与报告",
  });
});
