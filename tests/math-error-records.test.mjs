import test from "node:test";
import assert from "node:assert/strict";
import {
  errorRecordQuery,
  errorEvidence,
  errorRecordStatus,
  errorRecord,
  errorVotePayload,
  acknowledgedErrorVote,
} from "../src/components/math/error-records-model.mjs";

test("error history pagination uses source offset, fixed station and ten records", () => {
  assert.deepEqual(errorRecordQuery("question", 2), {
    System_Station_ID: 1,
    QuestionID: "question",
    limit: 10,
    page: 20,
  });
  assert.equal(errorRecordQuery(1, 0).page, 0);
  assert.throws(() => errorRecordQuery(""), /题目编号/);
});
test("error evidence keeps original image groups, repairs source extension and filters unsupported links", () => {
  const row = errorRecord({
    Notes:
      "https://example.com/error.png_yjs,javascript:alert(1),https://example.com/error.png_yjs",
    AnswerImg: "https://example.com/answer.png",
    Rightcount: 0,
    Errorcount: "2",
    Type: 1,
    DianzanState: "2",
  });
  assert.deepEqual(row.evidence, ["https://example.com/error.png"]);
  assert.deepEqual(row.answerEvidence, ["https://example.com/answer.png"]);
  assert.equal(row.rightCount, 0);
  assert.equal(row.errorCount, 2);
  assert.equal(row.vote, 2);
  assert.equal(row.status, "已采纳");
  assert.equal(errorRecordStatus(3), "未采纳");
  assert.equal(errorRecordStatus(0), "暂未标注处理结果");
  assert.deepEqual(errorEvidence(null), []);
});
test("new correctness vote identifies the feedback record rather than the question or its author", () => {
  assert.deepEqual(
    errorVotePayload({ ID: 8, QuestionID: 99, StuID: "author" }, "current", 1),
    { BusType: 9, BusID: 8, StuID: "current", Type: 1, State: 1 },
  );
  assert.throws(() => errorVotePayload({ ID: 8 }, "", 1), /连接/);
  assert.throws(() => errorVotePayload({ ID: 8 }, "current", 3), /无效/);
});
test("changing a prior vote preserves its own record ID and updates only State", () => {
  const row = { ID: 8, DianzanID: "42", DianzanState: 1 };
  assert.equal(errorVotePayload(row, "current", 1), null);
  assert.deepEqual(errorVotePayload(row, "current", 2), {
    BusType: 9,
    BusID: 8,
    StuID: "current",
    Type: 1,
    State: 2,
    ID: "42",
    UpdateColumns: "State",
  });
  assert.equal(acknowledgedErrorVote({ ID: 8 }, 1, "42").DianzanID, "42");
  assert.equal(acknowledgedErrorVote(row, 2, "修改成功").DianzanID, "42");
  assert.equal(row.DianzanState, 1);
});

import { readFile } from "node:fs/promises";
import ts from "typescript";
globalThis.__errorRecordsFixture = {
  errorRecordQuery,
  errorVotePayload,
  mathCommand: (...args) => globalThis.__errorCommand(...args),
  mathPost: (...args) => globalThis.__errorPost(...args),
};
const source = await readFile(
    new URL("../src/components/math/math-error-records.ts", import.meta.url),
    "utf8",
  ),
  output = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(/import \{[^}]+\} from ['"][^'"]+['"];?/g, "");
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from("const {errorRecordQuery,errorVotePayload,mathCommand,mathPost}=globalThis.__errorRecordsFixture;" + output).toString("base64")}`
);
test("error history and voting adapter use only the original learning contracts", async () => {
  const calls = [];
  globalThis.__errorCommand = async (...args) => {
    calls.push(["command", ...args]);
    return { data: [[]] };
  };
  globalThis.__errorPost = async (...args) => {
    calls.push(["post", ...args]);
    return { data: 42 };
  };
  await adapter.mathErrorRecordsApi.list("q", 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "command",
    "GetQuestionErrorToQuestionID",
    { System_Station_ID: 1, QuestionID: "q", limit: 10, page: 10 },
  ]);
  await adapter.mathErrorRecordsApi.vote(
    { ID: 8, DianzanState: 1 },
    "current",
    1,
  );
  assert.equal(calls.length, 1);
  await adapter.mathErrorRecordsApi.vote(
    { ID: 8, DianzanID: 42, DianzanState: 1 },
    "current",
    2,
  );
  assert.deepEqual(calls[1], [
    "post",
    "/api/sys_give/Inner_sys_give",
    {
      BusType: 9,
      BusID: 8,
      StuID: "current",
      Type: 1,
      State: 2,
      ID: 42,
      UpdateColumns: "State",
    },
  ]);
});
