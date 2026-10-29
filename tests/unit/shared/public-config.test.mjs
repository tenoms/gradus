import test from "node:test";
import assert from "node:assert/strict";
import configuration from "../../../config/system.json" with { type: "json" };
import { configureBrowserConfig, publicConfig, mathExternalUrl } from "../../../src/shared/config/public.mjs";
import { noteExportLinks } from "../../../src/features/math/notebook/notebook-model.mjs";
import { courseReportPrintLinks } from "../../../src/features/math/exams/report-model.mjs";
import { recommendationPrintUrl } from "../../../src/features/math/courses/course-recommendations-model.mjs";

test("frontend configuration keeps static settings and starts provider endpoints empty", () => {
  assert.equal(publicConfig.computer, configuration.public.computer);
  assert.equal(publicConfig.catalogCache, configuration.public.catalogCache);
  assert.deepEqual(publicConfig.math, { externalUrl: "", printStationId: 1 });
  assert.deepEqual(publicConfig.media, { polyvSdkUrl: "" });
  assert.equal(Object.hasOwn(publicConfig, "runtime"), false);
  assert.equal(Object.hasOwn(publicConfig, "initialPlatforms"), false);
  assert.equal(Object.hasOwn(publicConfig.computer, "defaultAvatarUrl"), false);
});

test("all fallback print links and notebook station use the public configuration", () => {
  const original = { ...publicConfig.math };
  const originalMedia = { ...publicConfig.media };
  try {
    configureBrowserConfig({
      math: { externalUrl: "https://print.example.test/custom", printStationId: 9, privateField: "ignored" },
      media: { polyvSdkUrl: "https://player.example.test/vod.js" },
      secret: "ignored",
    });
    assert.equal(Object.hasOwn(publicConfig.math, "privateField"), false);
    assert.equal(Object.hasOwn(publicConfig, "secret"), false);
    const note = new URL(noteExportLinks([{ ID: 1, CatalogID: 2 }], { stuid: "student" })[0].url);
    assert.equal(note.href.startsWith("https://print.example.test/custom/UserRecordLatex.html?"), true);
    assert.equal(note.searchParams.get("saasid"), "9");
    const context = { kind: "course", stuid: "student", CourseID: 1, CalendarID: 2, PaperID: 3 };
    const reports = courseReportPrintLinks(context, {}, [{ ID: 4 }]);
    assert.equal(reports.length, 3);
    assert.ok(reports.every(link => link.url.startsWith("https://print.example.test/custom/")));
    assert.equal(new URL(recommendationPrintUrl(context, { LinkSort: 4 })).pathname, "/custom/RecommendPaperPrintSpecial.html");
  } finally { Object.assign(publicConfig.math, original); Object.assign(publicConfig.media, originalMedia); }
});

test("unconfigured print endpoints omit fallbacks while preserving source file links", () => {
  const context = { kind: "course", stuid: "student", CourseID: 1, CalendarID: 2, PaperID: 3 };
  assert.equal(mathExternalUrl("UserRecordLatex.html"), null);
  assert.deepEqual(noteExportLinks([{ ID: 1, CatalogID: 2 }], { stuid: "student" }), []);
  assert.deepEqual(courseReportPrintLinks(context, {}, [{ ID: 4 }]), []);
  assert.deepEqual(courseReportPrintLinks(context, { Files: "https://files.example.test/paper.pdf" }), [
    { label: "原试卷打印", url: "https://files.example.test/paper.pdf" },
  ]);
  assert.equal(recommendationPrintUrl(context, { LinkSort: 4 }), "");
  assert.equal(recommendationPrintUrl(context, { Files: "https://files.example.test/recommend.pdf" }), "https://files.example.test/recommend.pdf");
});

test("the playback SDK loader reads its URL from public configuration", async () => {
  const originalUrl = publicConfig.media.polyvSdkUrl;
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  let inserted;
  try {
    publicConfig.media.polyvSdkUrl = "";
    globalThis.window = {};
    globalThis.document = { createElement: () => ({}), head: { append(script) { inserted = script; script.onload(); } } };
    const { loadMathPolyvSDK } = await import("../../../src/features/math/courses/MathPolyv.ts");
    await assert.rejects(loadMathPolyvSDK(), /未配置录播播放器/);
    assert.equal(inserted, undefined);
    publicConfig.media.polyvSdkUrl = "https://player.example.test/vod.js";
    await loadMathPolyvSDK();
    assert.equal(inserted.src, publicConfig.media.polyvSdkUrl);
  } finally {
    publicConfig.media.polyvSdkUrl = originalUrl;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});
