import test from "node:test";
import assert from "node:assert/strict";
import {
  courseAttachments,
  isCourseOwned,
  lessonCanPlay,
  lessonProgress,
  maskCourseReviewer,
  orderedSubcourses,
  studyCourseId,
} from "../src/components/computer/course-model.mjs";
test("subcourse order and active study identity follow source courseRelated instead of arbitrary array order", () => {
  const c = {
    id: "package",
    courseRelated: "b,a",
    courses: [{ id: "a" }, { id: "b" }],
  };
  assert.deepEqual(
    orderedSubcourses(c).map((x) => x.id),
    ["b", "a"],
  );
  assert.equal(studyCourseId(c), "b");
  assert.equal(studyCourseId(c, "a"), "a");
});
test("playback respects original joined/owned rights and explicitly free trial lessons", () => {
  assert.equal(isCourseOwned({}, false), false);
  assert.equal(isCourseOwned({}, true), true);
  assert.equal(isCourseOwned({}, false, true), true);
  assert.equal(lessonCanPlay({ mediaId: "media", isFree: 0 }, false), false);
  assert.equal(lessonCanPlay({ mediaId: "media", isFree: 2 }, false), true);
  assert.equal(lessonCanPlay({ isFree: 2 }, true), false);
});
test("attachments retain original attachmentList previewUrl and ignore non-http or duplicate paths", () => {
  const lesson = {
    attachmentList: [
      { attachName: "课件.pdf", previewUrl: "https://example.com/a.pdf" },
      { attachName: "重复.pdf", previewUrl: "https://example.com/a.pdf" },
    ],
  };
  const files = courseAttachments(lesson, {
    attachments: [{ name: "bad", url: "javascript:alert(1)" }],
  });
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "课件.pdf");
});
test("video progress remains bound to the originally selected course while navigating other subcourses", () => {
  const p = lessonProgress({
    lesson: { id: "lesson", _studyCourseId: "original", progress: "100%" },
    courseId: "new-menu-selection",
    position: 25,
    duration: 100,
    elapsed: 30,
    at: 123,
  });
  assert.equal(p.courseId, "original");
  assert.equal(p.progress, "100%");
  assert.equal(p.time, 30);
  assert.equal(p.historyModifyDate, 123);
});
test("reviewer names retain the original masking policy", () => {
  assert.equal(maskCourseReviewer("学习者"), "学***者");
  assert.equal(maskCourseReviewer("张"), "张");
});
