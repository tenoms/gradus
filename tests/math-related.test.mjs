import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesRelatedProperties,
  matchesRelatedSubject,
  relatedProperties,
  relatedGradeState,
  relatedResetPayload,
} from "../src/features/math/questions/math-related-model.ts";

test("question-bank scope follows the target by returned property labels, including common and shared questions", () => {
  const definitions = [
    { ID: 10, PropertyID: 5, PropertyName: "科目范围", Name: "仅数一" },
    { ID: 11, PropertyID: 5, PropertyName: "科目范围", Name: "仅数三" },
    { ID: 12, PropertyID: 5, PropertyName: "科目范围", Name: "仅数一数二" },
    { ID: 13, PropertyID: 5, PropertyName: "科目范围", Name: "公共考题" },
  ];
  const question = id => ({ json_data: JSON.stringify({ data: [{ PropertyID: 5, PropertyContentID: id }] }) });
  assert.equal(matchesRelatedSubject(question(11), "数一", definitions), false);
  assert.equal(matchesRelatedSubject(question(10), "数一", definitions), true);
  assert.equal(matchesRelatedSubject(question(12), "数二", definitions), true);
  assert.equal(matchesRelatedSubject(question(12), "数三", definitions), false);
  assert.equal(matchesRelatedSubject(question(13), "数一", definitions), true);
  assert.equal(matchesRelatedSubject(question(13), "数二", definitions), true);
  assert.equal(matchesRelatedSubject({}, "数二", definitions), true);
});

test("retraining clears a submitted answer on the explicitly selected log without changing question ownership", () => {
  const previous = { ID: 99, QuestionID: 6075, State: 1, IsSubmit: 1, MyAnswer: "123", ActiveOptionIDs: ["123"] };
  const result = { ...previous, ...relatedResetPayload(previous.ID) };
  assert.equal(result.QuestionID, 6075);
  assert.equal(result.State, 0);
  assert.equal(result.IsSubmit, 0);
  assert.equal(result.MyAnswer, "");
  assert.deepEqual(result.ActiveOptionIDs, []);
  assert.match(result.UpdateColumns, /State,IsSubmit,MyAnswer,ActiveOptionIDs/);
});

test("hierarchical question filters accept descendants and combine property groups", () => {
  const definitions = [
    { ID: 10, PID: 0, PropertyID: 1 },
    { ID: 11, PID: 10, PropertyID: 1 },
    { ID: 20, PID: 0, PropertyID: 2 },
    { ID: 21, PID: 20, PropertyID: 2 },
  ];
  const row = {
    json_data: JSON.stringify({
      data: [
        { PropertyID: 1, PropertyContentID: 11 },
        { PropertyID: 2, PropertyContentID: 21 },
      ],
    }),
  };
  assert.equal(
    matchesRelatedProperties(row, { 1: ["10"], 2: ["21"] }, definitions),
    true,
  );
  assert.equal(
    matchesRelatedProperties(row, { 1: ["10"], 2: ["22"] }, definitions),
    false,
  );
  assert.equal(
    matchesRelatedProperties(row, { 1: ["9", "11"] }, definitions),
    true,
  );
});
test("missing or malformed legacy property data does not create a matching category", () => {
  assert.deepEqual(relatedProperties({ json_data: "unreadable" }), []);
  assert.equal(
    matchesRelatedProperties({ json_data: "unreadable" }, { 1: ["10"] }, []),
    false,
  );
});
test("related practice preserves correct, partial multiple choice and wrong states", () => {
  const options = [
    { ID: 101, IsAnswer: 1 },
    { ID: 102, IsAnswer: 1 },
    { ID: 103, IsAnswer: 0 },
  ];
  assert.equal(relatedGradeState(options, "101,102", true), 1);
  assert.equal(relatedGradeState(options, "101", false), 2);
  assert.equal(relatedGradeState(options, "101,103", false), 3);
});
