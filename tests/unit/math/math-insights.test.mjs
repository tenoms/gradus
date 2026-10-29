import test from "node:test";
import assert from "node:assert/strict";
import {
  mathCapacityPayload,
  mathFrequencyRows,
} from "../../../src/features/math/questions/math-insights.ts";
test("question frequencies retain actual year scores and zero values without inventing predictions", () => {
  const [r] = mathFrequencyRows([
    {
      Type: "数一",
      Years: "2025:10,2024:0,bad",
      AvgScore: 5,
      Count: 2,
      Probability: 0,
    },
  ]);
  assert.equal(r.maxYear, 2025);
  assert.deepEqual(r.years, [
    { year: 2025, score: 10 },
    { year: 2024, score: 0 },
  ]);
  assert.equal(r.Probability, 0);
});
test("capacity writes use original Level and question identity, rejecting unsupported ratings", () => {
  assert.deepEqual(mathCapacityPayload("actor", 20, 30, 2), {
    Level: 2,
    StuID: "actor",
    BookID: 20,
    QuestionID: 30,
  });
  assert.throws(() => mathCapacityPayload("actor", 20, 30, 0));
});
