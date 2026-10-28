import test from "node:test";
import assert from "node:assert/strict";
import { relatedPackageRows } from "../src/platforms/math-related-packages.ts";
test("public packages retain actual ownership and only the specified free book is trialable", () => {
  const rows = relatedPackageRows(
    [
      {
        ID: 1,
        BusID: 8,
        Sort: 2,
        _book_list: [
          { ID: 7, BookYear: 2026 },
          { ID: 8, BookYear: 2025 },
        ],
      },
      { ID: 2, Sort: 1, _book_list: [] },
    ],
    [{ ID: 1 }],
  );
  assert.equal(rows[0].ID, 2);
  assert.equal(rows[0].owned, false);
  assert.equal(rows[1].owned, true);
  assert.equal(rows[1].books[0].ID, 8);
  assert.equal(rows[1].books[0].isFree, true);
  assert.equal(rows[1].books[1].isFree, false);
});
