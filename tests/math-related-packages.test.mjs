import test from "node:test";
import assert from "node:assert/strict";
import { relatedPackageRows } from "../src/platforms/math-related-packages.ts";

test("book packages retain all returned books without local ownership or trial annotations", () => {
  const input = [
    { ID: 1, BusID: 8, Sort: 2, _book_list: [{ ID: 7, BookYear: 2026 }, { ID: 8, BookYear: 2025 }] },
    { ID: 2, Sort: 1, _book_list: [] },
  ];
  const rows = relatedPackageRows(input);
  assert.deepEqual(rows.map(row => row.ID), [2, 1]);
  assert.deepEqual(rows[1].books.map(book => book.ID), [7, 8]);
  assert.equal(rows[1].owned, undefined);
  assert.equal(rows[1].books[0].isFree, undefined);
  assert.equal(rows[1].books[1].isFree, undefined);
  assert.deepEqual(input.map(row => row.ID), [1, 2]);
});
