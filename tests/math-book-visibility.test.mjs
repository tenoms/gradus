import test from "node:test";
import assert from "node:assert/strict";
import { mathVisibleBooks } from "../src/platforms/math-book-visibility.ts";
test("the original special book groups require their own course or exam allocation instead of general VIP", () => {
  const rows = [{ ID: 1 }, { ID: 721 }, { ID: 4893 }, { ID: 2170 }];
  assert.deepEqual(
    mathVisibleBooks(rows, [], []).map((r) => r.ID),
    [1],
  );
  assert.deepEqual(
    mathVisibleBooks(rows, [{ CourseProductID: "1149" }], []).map((r) => r.ID),
    [1, 721],
  );
  assert.deepEqual(
    mathVisibleBooks(rows, [{ CourseProductID: 2046 }], [{ ID: 2 }]).map(
      (r) => r.ID,
    ),
    [1, 4893, 2170],
  );
  assert.equal(rows.length, 4);
});
