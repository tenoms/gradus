import test from "node:test";
import assert from "node:assert/strict";
import {
  lessonDanmaku,
  activeDanmaku,
  danmakuTime,
  courseDanmakuPayload,
  sendCourseDanmaku,
} from "../../../src/features/computer/courses/course-danmaku-model.mjs";

test("lesson danmaku reads original fields, integer release times, stable duplicates and actual absence", () => {
  const rows = lessonDanmaku({
    lessonBulletComments: [
      { id: "b", bulletComments: "第二条", releaseTime: "10.9" },
      { id: "a", bulletComments: "第一条", releaseTime: 0 },
      { bulletComments: "同时刻", releaseTime: 10 },
      { bulletComments: "", releaseTime: 8 },
      { bulletComments: "无效", releaseTime: "invalid" },
      { bulletComments: "负数", releaseTime: -1 },
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.text, r.time]),
    [
      ["第一条", 0],
      ["第二条", 10],
      ["同时刻", 10],
    ],
  );
  assert.notEqual(rows[1].key, rows[2].key);
  assert.deepEqual(lessonDanmaku({}), []);
});
test("timed overlay follows video position and seeks without showing stale comments", () => {
  const rows = lessonDanmaku({
    lessonBulletComments: [
      { bulletComments: "开场", releaseTime: 0 },
      { bulletComments: "讲解", releaseTime: 10 },
      { bulletComments: "总结", releaseTime: 30 },
    ],
  });
  assert.deepEqual(
    activeDanmaku(rows, 9.6).map((r) => r.text),
    ["讲解"],
  );
  assert.deepEqual(
    activeDanmaku(rows, 16).map((r) => r.text),
    [],
  );
  assert.deepEqual(
    activeDanmaku(rows, 30).map((r) => r.text),
    ["总结"],
  );
  assert.deepEqual(
    activeDanmaku(rows, 0).map((r) => r.text),
    ["开场"],
  );
  assert.deepEqual(activeDanmaku(rows, NaN), []);
});
test("manual send preserves the source lesson, text limit and fractional playback time", () => {
  assert.deepEqual(
    courseDanmakuPayload({ id: "lesson" }, " 学习心得 ", 12.75, true),
    { lessonId: "lesson", bulletComments: "学习心得", releaseTime: 12.75 },
  );
  assert.throws(
    () => courseDanmakuPayload({ id: "lesson" }, "心得", 50, false),
    /尚未播放/,
  );
  assert.throws(
    () => courseDanmakuPayload({ id: "lesson" }, "字".repeat(21), 1, true),
    /不能大于20/,
  );
  assert.throws(
    () => courseDanmakuPayload({ id: "lesson" }, "  ", 1, true),
    /请输入/,
  );
  assert.throws(
    () => courseDanmakuPayload({ id: "lesson" }, "王道", 1, true),
    /课程弹幕环境/,
  );
  assert.throws(
    () => courseDanmakuPayload({ id: "lesson" }, "心得", NaN, true),
    /播放位置/,
  );
});
test("only explicit send posts the original bullet comment contract and requires business success", async () => {
  const calls = [],
    request = async (...args) => {
      calls.push(args);
      return { code: 200, data: true };
    },
    payload = courseDanmakuPayload({ id: "lesson" }, "加油", 2, true);
  lessonDanmaku({});
  activeDanmaku([], 0);
  assert.equal(calls.length, 0);
  await sendCourseDanmaku(request, payload);
  assert.deepEqual(calls, [
    [
      "computer",
      {
        path: "/api/exam/wx/bulletComment/add/",
        method: "POST",
        data: payload,
      },
    ],
  ]);
  await assert.rejects(
    sendCourseDanmaku(
      async () => ({ code: 4001, msg: "平台未接受这条弹幕" }),
      payload,
    ),
    /平台未接受/,
  );
});
test("danmaku timestamps retain hour boundaries and zero", () => {
  assert.equal(danmakuTime(0), "00:00");
  assert.equal(danmakuTime(65.8), "01:05");
  assert.equal(danmakuTime(3661), "1:01:01");
});
