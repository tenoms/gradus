import test from "node:test";
import assert from "node:assert/strict";
import {
  modelExerciseCount,
  modelStudyPayload,
  guideStudyPayload,
} from "../src/features/math/practice/math-model.ts";

test("guide continuation updates only the current album log and keeps another lesson's history intact", () => {
  const lesson = { ID: 462, BusID: 405 };
  const unrelated = guideStudyPayload("student", lesson, { ID: 99, AlbumID: 500, BusID: 477 });
  assert.equal(unrelated.ID, undefined);
  assert.equal(unrelated.AlbumID, 405);
  assert.equal(unrelated.BusID, 462);
  assert.equal(unrelated.Type, "直播模块");
  const existing = guideStudyPayload("student", lesson, { ID: 88, AlbumID: 405, BusID: 462 });
  assert.equal(existing.ID, 88);
  assert.equal(existing.UpdateColumns, "ID,AddTime");
});
import { normalizedCrop, cropPixels } from "../src/features/math/library/math-image.ts";
test("model study logs preserve distinct content, question and previous answer IDs", () => {
  const value = modelStudyPayload({
    stuid: "current-user",
    albumId: 3,
    catalogId: 4,
    row: { ID: 11, QuestionID: 101, AnswerID: 201 },
    answer: "7,8",
    correct: true,
  });
  assert.equal(value.ContentID, 11);
  assert.equal(value.QuestionID, 101);
  assert.equal(value.ID, 201);
  assert.equal(value.Answer, 1);
  assert.equal(value.BusValue, "7,8");
});
test("lead filling study logs carry the original course context and recommendation ID", () => {
  const value = modelStudyPayload({
    stuid: "current-user",
    row: { ID: 11, QuestionID: 101 },
    answer: "",
    correct: false,
    isLeadFill: true,
    context: { ProductID: 3, CourseID: 4, LeadFillID: 5 },
  });
  assert.equal(value.BusType, "真题查漏补缺");
  assert.equal(value.BusID, 5);
  assert.equal(value.CourseID, 4);
  assert.equal(value.Answer, 2);
  assert.equal("ID" in value, false);
  assert.equal(
    modelExerciseCount([
      { ContentList: [{ QuestionID: 9 }, { children: [{ QuestionID: 10 }] }] },
    ]),
    2,
  );
  assert.equal(
    modelExerciseCount([
      { ContentList: [{ Type: "总结", Content: "只有总结" }] },
    ]),
    0,
  );
});
test("image crop uses the actual displayed region and supports reversed drags", () => {
  const box = normalizedCrop({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 });
  const pixels = cropPixels(box, 1000, 500);
  assert.deepEqual(pixels, { x: 200, y: 50, width: 600, height: 300 });
});
test("course album exercises retain their original 习题 type and course scope separately from modules", () => {
  const payload = modelStudyPayload({
    stuid: "student",
    albumId: 5,
    catalogId: 6,
    row: { ID: 7, QuestionID: 8, AnswerID: 9 },
    answer: "",
    correct: true,
    kind: "album",
    context: { ProductID: 10, CourseID: 11 },
  });
  assert.equal(payload.Type, "习题");
  assert.equal(payload.ID, 9);
  assert.equal(payload.ContentID, 7);
  assert.equal(payload.QuestionID, 8);
  assert.equal(payload.ProductID, 10);
  assert.equal(payload.CourseID, 11);
  assert.equal(payload.BusType, undefined);
});
