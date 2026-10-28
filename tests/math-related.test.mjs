import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesRelatedProperties,
  relatedProperties,
  relatedGradeState,
} from "../src/platforms/math-related-model.ts";

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
