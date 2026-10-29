import test from "node:test";
import assert from "node:assert/strict";
import {
  moveNotesPayload,
  noteExportLinks,
  noteQuestionRow,
  noteRecordId,
  sortCatalogPayload,
} from "../src/features/math/notebook/notebook-model.mjs";
test("book notes and question-bank notes preserve separate record and question identities", () => {
  assert.equal(noteRecordId({ ID: 1, RelD: 9 }, "book"), "1");
  assert.equal(noteRecordId({ ID: 1, RelD: 9 }, "bank"), "9");
  assert.equal(
    noteQuestionRow({ ID: 4, QID: 21, QuestionID: 70 }, "bank").QuestionID,
    21,
  );
  assert.equal(
    noteQuestionRow({ ID: 4, QID: 21, QuestionID: 70 }, "book").QuestionID,
    70,
  );
});
test("batch move uses source UpdateIds rather than the deletion ids parameter", () => {
  assert.deepEqual(moveNotesPayload(["11", "12"], "7"), {
    UpdateIds: "11,12",
    CatalogID: 7,
    UpdateColumns: "CatalogID",
  });
  assert.deepEqual(
    JSON.parse(sortCatalogPayload([{ ID: 17 }, { ID: 19 }]).Content),
    [
      { ID: 17, Sort: 0 },
      { ID: 19, Sort: 1 },
    ],
  );
});
test("PDF exports keep category scopes, selected record IDs and source format", () => {
  const links = noteExportLinks(
    [
      { ID: 1, CatalogID: 7 },
      { ID: 2, CatalogID: 8 },
    ],
    { stuid: "fixture-student", kind: "笔记" },
  );
  assert.equal(links.length, 2);
  assert.equal(new URL(links[0].url).searchParams.get("buskey"), "7");
  assert.equal(new URL(links[1].url).searchParams.get("catalogids"), "2");
  const bank = noteExportLinks([{ ID: 1, QID: 99 }], {
    origin: "bank",
    stuid: "fixture-student",
  });
  assert.equal(new URL(bank[0].url).searchParams.get("busindex"), "2");
  assert.equal(new URL(bank[0].url).searchParams.get("catalogids"), "99");
});
test("exports include every selected record without account or download-count gates", () => {
  assert.throws(() => noteExportLinks([], { stuid: "me" }), /先选择/);
  const files = noteExportLinks(Array.from({ length: 107 }, (_, index) => ({ ID: index + 1, CatalogID: 1 })), { stuid: "me" });
  assert.equal(files.flatMap(file => file.recordIds).length, 107);
  assert.equal(new Set(files.flatMap(file => file.recordIds)).size, 107);
});
test("large exports split into file batches without losing selected records", () => {
  const files = noteExportLinks(
    Array.from({ length: 65 }, (_, n) => ({ ID: n + 1, CatalogID: 1 })),
    { stuid: "me" },
  );
  assert.deepEqual(
    files.map((x) => x.count),
    [30, 30, 5],
  );
  assert.equal(files.flatMap((x) => x.recordIds).length, 65);
  assert.equal(new Set(files.flatMap((x) => x.recordIds)).size, 65);
});
test("print-history matching preserves original per-question and book scope", async () => {
  const { notePrintHistoryParams, noteWasPrinted } = await import("../src/features/math/notebook/notebook-model.mjs");
  assert.deepEqual(notePrintHistoryParams("me", "7"), { StuID: "me", BusKey: 7 });
  const history = [{ Question_ID: 33, BookID: 44 }];
  assert.equal(noteWasPrinted({ QuestionID: 33, BookID: 44 }, history), true);
  assert.equal(noteWasPrinted({ QuestionID: 33, BookID: 45 }, history), false);
});
