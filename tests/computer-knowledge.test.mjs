import test from "node:test";
import assert from "node:assert/strict";
import {
  computerKnowledgeIndex,
  computerKnowledgeMajorId,
  computerKnowledgeReferences,
  createComputerKnowledgeLoader,
  resolveComputerKnowledgeTags,
} from "../src/features/computer/practice/computer-knowledge.mjs";

const major = "701769479767592960", chapter = "701807269960093696", point = "1217877249962024960";
const question = { exerciseProperty: { knowledgeTags: [`${major},${chapter},${point}`] } };

test("original comma-separated knowledge paths preserve every long identifier without numeric conversion", () => {
  assert.deepEqual(computerKnowledgeReferences(question), [major, chapter, point].map(id => ({ id, name: "" })));
  assert.equal(computerKnowledgeMajorId(question, "different-search-subject"), major);
  assert.equal(computerKnowledgeMajorId({ majorId: "explicit", ...question }), "explicit");
  assert.equal(computerKnowledgeMajorId({}, major), major);
  assert.deepEqual(computerKnowledgeReferences({ knowledgeTagsIndex: [major, chapter, point, chapter] }), [major, chapter, point].map(id => ({ id, name: "" })));
});

test("chapter and nested point dictionaries produce text labels while absent names are counted without exposing IDs", () => {
  const index = computerKnowledgeIndex([{ id: chapter, name: "绪论", children: [{ id: point, name: "空间复杂度" }] }], { [major]: "数据结构" });
  assert.deepEqual(resolveComputerKnowledgeTags(question, index), { tags: [
    { id: major, name: "数据结构" }, { id: chapter, name: "绪论" }, { id: point, name: "空间复杂度" },
  ], missing: 0 });
  assert.deepEqual(resolveComputerKnowledgeTags(question, { [major]: "数据结构", [chapter]: "绪论" }), { tags: [
    { id: major, name: "数据结构" }, { id: chapter, name: "绪论" },
  ], missing: 1 });
});

test("question-provided names override catalog labels and duplicate names render once", () => {
  const withNames = { exerciseProperty: { knowledgeTags: [{ id: point, name: "空间复杂度" }, { id: chapter, knowledgeName: "算法分析" }, "空间复杂度"] } };
  assert.deepEqual(resolveComputerKnowledgeTags(withNames, { [point]: "旧名称" }), { tags: [{ id: point, name: "空间复杂度" }, { id: chapter, name: "算法分析" }], missing: 0 });
  assert.deepEqual(resolveComputerKnowledgeTags({ ...question, knowledgeNames: ["数据结构", "绪论", "空间复杂度"] }).tags.map(tag => tag.name), ["数据结构", "绪论", "空间复杂度"]);
});

test("catalog loading shares in-flight and completed subject requests, separates identities and retries a failure", async () => {
  const calls = [];
  let reject = false;
  const load = createComputerKnowledgeLoader(async (path, query) => {
    calls.push({ path, query });
    if (reject) throw new Error("temporarily unavailable");
    return [{ id: chapter, name: "绪论" }];
  });
  const [a, b] = await Promise.all([load("user-a", major), load("user-a", major)]);
  assert.deepEqual(a, b);
  await load("user-a", major);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { path: "/api/exam/wx/practice/knowledge", query: { majorId: major, examType: 2 } });
  await load("user-b", major);
  assert.equal(calls.length, 2);
  reject = true;
  await assert.rejects(load("user-c", major), /temporarily/);
  reject = false;
  assert.deepEqual(await load("user-c", major), { [chapter]: "绪论" });
  await load("user-a", major, true);
  assert.equal(calls.length, 5);
});
