import test from "node:test";
import assert from "node:assert/strict";
import { paginationState, paginationPages } from "../../../src/shared/ui/pagination/pagination-model.mjs";

test("pagination reaches every record once including the final partial page", () => {
  const all = Array.from({ length: 103 }, (_, index) => index);
  const viewed = [];
  for (let page = 1; page <= 6; page++) {
    const state = paginationState({ page, pageSize: 20, total: all.length });
    viewed.push(...all.slice(state.start, state.end));
  }
  assert.deepEqual(viewed, all);
});
test("empty results and shrinking filters keep page and bounds valid", () => {
  assert.deepEqual(paginationState({ page: 99, pageSize: 20, total: 0 }), { page: 1, pageSize: 20, total: 0, pageCount: 1, start: 0, end: 0 });
  assert.equal(paginationState({ page: 5, pageSize: 20, total: 21 }).page, 2);
  assert.equal(paginationState({ page: -1, pageSize: 10, total: 21 }).page, 1);
});
test("large lists have bounded page controls with first, current and last page accessible", () => {
  for (const page of [1, 2, 4, 5, 50, 97, 99, 100]) {
    const pages = paginationPages(page, 100);
    assert.ok(pages.length <= 9);
    assert.equal(pages[0], 1);
    assert.equal(pages.at(-1), 100);
    assert.ok(pages.includes(page));
    const numbers = pages.filter(value => typeof value === "number");
    assert.equal(new Set(numbers).size, numbers.length);
    assert.deepEqual(numbers, [...numbers].sort((a,b) => a-b));
  }
});
