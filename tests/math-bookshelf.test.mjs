import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
globalThis.__shelfFixture = {
  mathData: (r) => r?.data ?? r?.Data ?? r,
  mathRows: (r) => {
    const d = r?.data ?? r?.Data ?? r;
    return Array.isArray(d) ? (Array.isArray(d[0]) ? d[0] : d) : [];
  },
  mathApi: { books: () => globalThis.__shelfBooks() },
  mathCommand: (...args) => globalThis.__shelfCommand(...args),
  mathPost: (...args) => globalThis.__shelfPost(...args),
};
const source = await readFile(
  new URL("../src/components/math/math-bookshelf.ts", import.meta.url),
  "utf8",
);
const output = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /import \{([^}]+)\} from ['"]\.\.\/\.\.\/platforms\/math['"];?/,
    (_, names) => `const {${names}}=globalThis.__shelfFixture;`,
  );
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);
test("bookshelf ID updates deduplicate additions and preserve unrelated books when removing", () => {
  assert.deepEqual(adapter.shelfIds("1,2,1,,3"), ["1", "2", "3"]);
  assert.equal(adapter.changeShelfIds("1,2", [2, 3]), "1,2,3");
  assert.equal(adapter.changeShelfIds("1,2,3", [2], true), "1,3");
  assert.equal(adapter.changeShelfIds("1", [1], true), "");
  assert.equal(adapter.shelfField({ BusType: "试卷" }), "PaperIDs");
  assert.equal(adapter.shelfField({ BusType: "书籍" }), "EBookIDs");
});
test("bookshelf reads personal progress and retains existing editions absent from the current catalogue", () => {
  const rows = adapter.mergeShelfBooks(
    [{ ID: 1, Name: "book" }],
    [
      { ID: 1, StudentCount: 3, QuestionSearchCount: 10 },
      { ID: 2, Name: "older edition", StudentCount: 5, QuestionSearchCount: 5 },
    ],
    { EBookIDs: "1", PaperIDs: "2" },
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Name, "book");
  assert.equal(rows[0].StudentCount, 3);
  assert.equal(rows[1].Name, "older edition");
  assert.deepEqual(adapter.shelfProgress(rows[0]), {
    total: 10,
    read: 3,
    percent: 30,
  });
  assert.equal(adapter.shelfProgress({}).percent, 0);
});
test("resume normalizes actual question ID separately from book page and printed question number", () => {
  const last = adapter.shelfLastQuestion({
    qID: 999,
    questionPage: 42,
    questionID: 7,
  });
  assert.equal(last.QuestionID, 999);
  assert.equal(last.QuestionPage, 42);
  assert.equal(last.QuestionSort, 7);
  assert.equal(adapter.shelfLastQuestion(undefined), undefined);
});
test("bookshelf update uses the original user-ID and single-field UpdateColumns contract", async () => {
  let call;
  globalThis.__shelfPost = async (...args) => {
    call = args;
    return { msg: "操作成功" };
  };
  await adapter.bookshelfApi.update({ ID: 12 }, "PaperIDs", "1,2");
  assert.deepEqual(call, [
    "/api/sys_users/Inner_sys_users",
    { ID: 12, PaperIDs: "1,2", UpdateColumns: "ID,PaperIDs" },
  ]);
  assert.throws(() => adapter.bookshelfApi.update({}, "EBookIDs", "1"), /账号/);
});
test("bookshelf loader selects fresh shelf fields and fetches matching progress and recent records", async () => {
  const calls = [];
  globalThis.__shelfBooks = async () => ({ data: [[{ ID: 1, Name: "book" }]] });
  globalThis.__shelfCommand = async (name, query, model) => {
    calls.push({ name, query, model });
    if (name === "GetUserInfoByStuID")
      return {
        data: [
          [{ ID: 8, EBookIDs: "1", PaperIDs: "", Pwd: "fixture-not-for-ui" }],
        ],
      };
    if (name === "GetBookListSysUserRecordPlan")
      return { data: [[{ ID: 1, StudentCount: 2, QuestionSearchCount: 8 }]] };
    return { data: [[]] };
  };
  const data = await adapter.bookshelfApi.load("student");
  assert.equal(data.user.Pwd, undefined);
  assert.equal(data.shelf[0].StudentCount, 2);
  assert.deepEqual(
    calls.find((c) => c.name === "GetBookListSysUserRecordPlan").query,
    { StuID: "student", BookIDs: "1" },
  );
  assert.equal(
    calls.find((c) => c.name === "GetBookListCountAndLookCount_LastTop3").model,
    true,
  );
});
