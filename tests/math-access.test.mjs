import test from "node:test";
import assert from "node:assert/strict";
import {
  mathBookAnalysisAllowed,
  mathBookNeedsUsageCheck,
  mathQrcodeRequestPlan,
  mathVipActive,
} from "../src/platforms/math-access-model.ts";
const now = Date.parse("2026-10-29T12:00:00+08:00"),
  book = { IsActCode: 1, ActBusCount: 2, IsVipActCode: 0 };
test("book analysis retains exact trial allowance, already-viewed IDs and activated actor rights", () => {
  assert.equal(
    mathBookAnalysisAllowed({ book, user: {}, qid: 3, viewed: [1, 2], now }),
    false,
  );
  assert.equal(
    mathBookAnalysisAllowed({ book, user: {}, qid: 2, viewed: [1, 2], now }),
    true,
  );
  assert.equal(
    mathBookAnalysisAllowed({ book, user: {}, qid: 3, viewed: [1], now }),
    true,
  );
  assert.equal(
    mathBookAnalysisAllowed({
      book,
      user: { IsAct: 2 },
      qid: 3,
      viewed: [1, 2],
      now,
    }),
    true,
  );
});
test("VIP bypass applies only when the original book explicitly permits VIP activation", () => {
  const user = { VipEndTime: "2026-10-30 00:00:00" };
  assert.equal(mathVipActive(user, now), true);
  assert.equal(
    mathBookAnalysisAllowed({ book, user, qid: 3, viewed: [1, 2], now }),
    false,
  );
  assert.equal(
    mathBookAnalysisAllowed({
      book: { ...book, IsVipActCode: 1 },
      user,
      qid: 3,
      viewed: [1, 2],
      now,
    }),
    true,
  );
  assert.equal(
    mathVipActive({ VipEndTime: "2026-10-28 00:00:00" }, now),
    false,
  );
});
test("actual free preview and already authorized course sources preserve their independent rights", () => {
  for (const source of ["课程", "专辑", "选择题库", "考试"])
    assert.equal(
      mathBookAnalysisAllowed({
        book,
        user: {},
        qid: 3,
        viewed: [1, 2],
        source,
        now,
      }),
      true,
    );
  assert.equal(
    mathBookAnalysisAllowed({
      book,
      user: {},
      qid: 3,
      viewed: [1, 2],
      preview: true,
      now,
    }),
    true,
  );
});

test("a quota-bearing book always reads existing usage before accepting another question", () => {
  assert.equal(mathBookNeedsUsageCheck(book, {}, now), true);
  assert.equal(
    mathBookNeedsUsageCheck({ ...book, IsActCode: 0 }, {}, now),
    false,
  );
  assert.equal(mathBookNeedsUsageCheck(book, { IsAct: 2 }, now), false);
});
test("both original QR lookups use Model while course validation remains a separate original command", () => {
  const plan = mathQrcodeRequestPlan("fixture-code");
  assert.equal(plan.mapping.model, true);
  assert.equal(plan.content.model, true);
  assert.equal(plan.mapping.command, "CheckQrcodeQuestionInZhenTiList2");
  assert.deepEqual(plan.content.params, { qrcode: "fixture-code" });
});
test("nonmember note limits retain original distinct error/favorite caps and do not restrict plain notes", async () => {
  const { mathNoteQuotaAllowed } =
    await import("../src/platforms/math-access-model.ts");
  const config = { IsNotVipErrorQuestion: 10, IsNotVipCollectQuestion: 20 };
  assert.equal(mathNoteQuotaAllowed("错题", 10, config, {}, now), true);
  assert.equal(mathNoteQuotaAllowed("错题", 11, config, {}, now), false);
  assert.equal(mathNoteQuotaAllowed("收藏", 15, config, {}, now), true);
  assert.equal(mathNoteQuotaAllowed("笔记", 100, config, {}, now), true);
  assert.equal(
    mathNoteQuotaAllowed(
      "错题",
      100,
      config,
      { VipEndTime: "2026-10-30" },
      now,
    ),
    true,
  );
});
test("album permission keeps permanent free, valid free, expired free, VIP-only and PID4 scopes distinct", async () => {
  const { mathAlbumAllowed } =
    await import("../src/platforms/math-access-model.ts");
  assert.equal(mathAlbumAllowed({ Authority: 1 }, {}, now), true);
  assert.equal(
    mathAlbumAllowed(
      { Authority: 1, FreeEndTime: "2026-10-30T00:00:00" },
      {},
      now,
    ),
    true,
  );
  assert.equal(
    mathAlbumAllowed(
      { Authority: 1, FreeEndTime: "2026-10-28T00:00:00" },
      {},
      now,
    ),
    false,
  );
  assert.equal(mathAlbumAllowed({ Authority: 0 }, {}, now), false);
  assert.equal(
    mathAlbumAllowed(
      { Authority: 0 },
      { VipEndTime: "2026-10-30T00:00:00" },
      now,
    ),
    true,
  );
  assert.equal(mathAlbumAllowed({ Authority: 0, PID: 4 }, {}, now), true);
});
