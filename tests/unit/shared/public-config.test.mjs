import test from "node:test";
import assert from "node:assert/strict";
import { publicConfig } from "../../../src/shared/config/public.mjs";
import { noteExportLinks } from "../../../src/features/math/notebook/notebook-model.mjs";
import { courseReportPrintLinks } from "../../../src/features/math/exams/report-model.mjs";
import { recommendationPrintUrl } from "../../../src/features/math/courses/course-recommendations-model.mjs";

test("all fallback print links and notebook station use the public configuration", () => {
  const original = { ...publicConfig.math };
  try {
    publicConfig.math.externalBaseUrl = "https://print.example.test/custom";
    publicConfig.math.printStationId = 9;
    const note = new URL(noteExportLinks([{ ID: 1, CatalogID: 2 }], { stuid: "student" })[0].url);
    assert.equal(note.href.startsWith("https://print.example.test/custom/UserRecordLatex.html?"), true);
    assert.equal(note.searchParams.get("saasid"), "9");
    const context = { kind: "course", stuid: "student", CourseID: 1, CalendarID: 2, PaperID: 3 };
    const reports = courseReportPrintLinks(context, {}, [{ ID: 4 }]);
    assert.equal(reports.length, 3);
    assert.ok(reports.every(link => link.url.startsWith("https://print.example.test/custom/")));
    assert.equal(new URL(recommendationPrintUrl(context, { LinkSort: 4 })).pathname, "/custom/RecommendPaperPrintSpecial.html");
  } finally { Object.assign(publicConfig.math, original); }
});

test("the playback SDK loader reads its URL from public configuration", async () => {
  const originalUrl = publicConfig.media.polyvSdkUrl;
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  let inserted;
  try {
    publicConfig.media.polyvSdkUrl = "https://player.example.test/vod.js";
    globalThis.window = {};
    globalThis.document = { createElement: () => ({}), head: { append(script) { inserted = script; script.onload(); } } };
    const { loadMathPolyvSDK } = await import("../../../src/features/math/courses/MathPolyv.ts");
    await loadMathPolyvSDK();
    assert.equal(inserted.src, publicConfig.media.polyvSdkUrl);
  } finally {
    publicConfig.media.polyvSdkUrl = originalUrl;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});
