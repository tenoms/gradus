import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeReportText,
  reportSnapshotDocument,
  reportSnapshotFilename,
  safeReportSnapshotImage,
} from "../src/features/math/exams/report-share-model.mjs";

const now = new Date("2026-10-29T12:34:56Z");
test("report filenames are identifiable HTML snapshots and remove filesystem separators", () => {
  const file = reportSnapshotFilename("课程 / 第1卷:报告?", now);
  assert.equal(file, "课程 第1卷 报告-报告快照-20261029-123456.html");
  assert.equal(/[\\/:*?"<>|]/.test(file), false);
  assert.match(reportSnapshotFilename("", now), /^学习报告-报告快照-/);
});
test("snapshot title cannot insert markup into the independent document", () => {
  assert.equal(
    escapeReportText("<script>\"&'</script>"),
    "&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;",
  );
  const html = reportSnapshotDocument(
    "</title><script>alert(1)</script>",
    "<p>已加载的成绩 98 分</p>",
    now,
  );
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /已加载的成绩 98 分/);
});
test("snapshot has its own print styles, no script and a restrictive static-content policy", () => {
  const html = reportSnapshotDocument(
    "课程成绩",
    '<svg><path d="M0 0L20 20"></path></svg>',
    now,
  );
  assert.match(html, /<!doctype html>/);
  assert.match(html, /@media print/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.equal(/<script|<iframe|<link[^>]+stylesheet/i.test(html), false);
  assert.match(html, /不会自动公开/);
});
test("loaded question images allow ordinary image sources while media or executable addresses are excluded", () => {
  assert.equal(
    safeReportSnapshotImage("/question/1.png", "https://example.test/report"),
    "https://example.test/question/1.png",
  );
  assert.equal(
    safeReportSnapshotImage("data:image/png;base64,AA=="),
    "data:image/png;base64,AA==",
  );
  for (const url of [
    "javascript:alert(1)",
    "data:text/html;base64,AA==",
    "https://example.test/play.m3u8?token=secret",
    "https://user:secret@example.test/image.png",
    "blob:temporary",
  ])
    assert.equal(safeReportSnapshotImage(url), "");
});
