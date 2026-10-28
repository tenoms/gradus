import test from "node:test";
import assert from "node:assert/strict";
import {
  moveNotesPayload,
  noteExportLinks,
  noteQuestionRow,
  noteRecordId,
  sortCatalogPayload,
} from "../src/components/math/notebook-model.mjs";
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
test("export respects existing account limits and never silently widens the selected set", () => {
  assert.throws(() => noteExportLinks([], { stuid: "me" }), /先选择/);
  assert.throws(
    () => noteExportLinks([{ ID: 1 }], { stuid: "me", downloadCount: 101 }),
    /额度/,
  );
  assert.throws(
    () =>
      noteExportLinks(
        Array.from({ length: 7 }, (_, ID) => ({ ID })),
        { stuid: "me" },
      ),
    /最多导出 6/,
  );
  assert.equal(
    noteExportLinks(
      Array.from({ length: 30 }, (_, ID) => ({ ID, CatalogID: 1 })),
      { stuid: "me", vip: true },
    )[0].count,
    30,
  );
});
test("VIP exports split at the original 30-question batch limit without losing selected records", () => {
  const files = noteExportLinks(
    Array.from({ length: 65 }, (_, n) => ({ ID: n + 1, CatalogID: 1 })),
    { stuid: "me", vip: true },
  );
  assert.deepEqual(
    files.map((x) => x.count),
    [30, 30, 5],
  );
  assert.equal(files.flatMap((x) => x.recordIds).length, 65);
  assert.equal(new Set(files.flatMap((x) => x.recordIds)).size, 65);
});
test("explicit print actions use question IDs and preserve original per-record print scope", async () => {
  const { notePrintHistoryParams, notePrintLogRecords, noteWasPrinted } =
    await import("../src/components/math/notebook-model.mjs");
  assert.deepEqual(notePrintHistoryParams("me", "7"), {
    StuID: "me",
    BusKey: 7,
  });
  const records = notePrintLogRecords(
    [{ ID: 99, QuestionID: 33, bookID: 44, CatalogID: 7 }],
    { stuid: "me" },
  );
  assert.deepEqual(records, [
    {
      BusValue: "收藏错题打印",
      Question_ID: 33,
      BusKey: 7,
      BookID: 44,
      System_Station_ID: 1,
      StuID: "me",
      BusID: 33,
    },
  ]);
  assert.equal(noteWasPrinted({ QuestionID: 33, BookID: 44 }, records), true);
  assert.equal(noteWasPrinted({ QuestionID: 33, BookID: 45 }, records), false);
  assert.equal(
    notePrintLogRecords([{ ID: 99, QID: 123, BookID: 8 }], {
      stuid: "me",
      origin: "bank",
    })[0].Question_ID,
    123,
  );
});
