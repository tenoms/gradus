import test from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createHash } from "node:crypto";
import { firstScorePayload } from "../server/first-score.mjs";
import { encryptMathMaster } from "../server/upstream.mjs";
test("first score updates only the fixed table and server-owned existing key and actor", () => {
  const result = firstScorePayload(
    {
      Subject1: "政治",
      Subject2: "英语",
      Subject3: "数学",
      Subject4: "专业课",
      name: "other-table",
      Key: "forged",
      StuID: "other-user",
      Subject1Score: 60,
      Subject2Score: 70,
      Subject3Score: 100,
      Subject4Score: 110,
      UserRoot: 9,
      TotalScore: 500,
      IsFinish: 1,
    },
    { Key: "owned-key" },
    "me",
    [
      {
        Subject1: "政治",
        Subject1Score: 100,
        Subject2: "英语",
        Subject2Score: 100,
        Subject3: "数学",
        Subject3Score: 150,
        Subject4: "专业课",
        Subject4Score: 150,
      },
    ],
  );
  assert.equal(result.name, "xy_user_first_scores");
  assert.equal(result.Type, "update");
  assert.deepEqual(result.where, { Key: "owned-key" });
  assert.equal(result.Col.StuID, "me");
  assert.equal(result.Col.TotalScore, 340);
  assert.equal(result.Col.UserRoot, undefined);
  assert.equal(result.Col.Key, undefined);
});
test("first score draft merges prior authorized fields and rejects invalid marks", () => {
  const result = firstScorePayload(
    { Subject2: "英语", Subject2Score: 72 },
    { Subject1: "政治", Subject1Score: 61, SchoolName: "existing" },
    "me",
    [
      {
        Subject1: "政治",
        Subject1Score: 100,
        Subject2: "英语",
        Subject2Score: 100,
      },
    ],
  );
  assert.equal(result.Col.TotalScore, 133);
  assert.equal(result.Col.SchoolName, "existing");
  assert.equal(result.Type, "insert");
  assert.throws(
    () =>
      firstScorePayload({ Subject1: "政治", Subject1Score: 101 }, {}, "me", [
        { Subject1: "政治", Subject1Score: 100 },
      ]),
    { status: 400 },
  );
});
test("fixed master payload follows original station-key AES and a single JSON encoding", () => {
  const value = {
      name: "xy_user_first_scores",
      Col: { StuID: "fixture" },
      Type: "insert",
    },
    encrypted = encryptMathMaster(JSON.stringify(value));
  const decipher = createDecipheriv(
    "aes-256-cbc",
    Buffer.from(createHash("md5").update("1D").digest("hex")),
    Buffer.from("59b87344b54f3197"),
  );
  const decoded = Buffer.concat([
    decipher.update(encrypted, "base64"),
    decipher.final(),
  ]).toString("utf8");
  assert.deepEqual(JSON.parse(decoded), value);
});

test("professional exam score limits come from server-fetched subject metadata", () => {
  const subjects = [
    {
      Subject1: "管理类综合",
      Subject1Score: 200,
      Subject2: "英语二",
      Subject2Score: 100,
    },
    {
      Subject1: "管理类综合",
      Subject1Score: 999,
      Subject2: "其他",
      Subject2Score: 100,
    },
  ];
  const result = firstScorePayload(
    {
      Subject1: "管理类综合",
      Subject1Score: 190,
      Subject2: "英语二",
      Subject2Score: 90,
      IsFinish: 1,
    },
    {},
    "me",
    subjects,
  );
  assert.equal(result.Col.TotalScore, 280);
  assert.throws(
    () =>
      firstScorePayload(
        { Subject1: "管理类综合", Subject1Score: 201 },
        {},
        "me",
        subjects,
      ),
    { status: 400 },
  );
  assert.equal(
    firstScorePayload({ Subject3: "专业综合", Subject3Score: 290 }, {}, "me", [
      { Subject3: "专业综合", Subject3Score: 300 },
    ]).Col.TotalScore,
    290,
  );
});
