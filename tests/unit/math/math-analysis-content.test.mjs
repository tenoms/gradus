import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMathAnalysisContent } from "../../../src/features/math/questions/math-analysis-content.mjs";
import { formatLearningContent } from "../../../src/shared/content/content.mjs";

test("source answer wrappers become one heading while the answer and its inline code survive", () => {
  const normalized = normalizeMathAnalysisContent("《答案》【答案】`(D).`《/答案》\\\n《分析》【解析】《/分析》");
  assert.equal(normalized, "<strong>答案</strong>\n\n`(D).`");
  const html = formatLearningContent(normalized);
  assert.match(html, /<strong>答案<\/strong>/);
  assert.match(html, /<code>\(D\)\.<\/code>/);
  assert.doesNotMatch(html, /《|【答案】|【解析】|<strong>解析/);
});

test("answers outside the empty wrapper and repeated analysis prefixes retain meaningful sections", () => {
  const normalized = normalizeMathAnalysisContent("《答案》【答案】《/答案》$({\\rm B})$.\n《分析》【思路分析】【思路分析】直接泰勒展开。看《高等数学》。\n《/分析》\n$x^2$\n《步骤》<b>第一步：求导</b>《/步骤》");
  assert.match(normalized, /<strong>答案<\/strong>\n\n\$\(\{\\rm B\}\)\$/);
  assert.match(normalized, /<strong>解析<\/strong>\n\n直接泰勒展开/);
  assert.match(normalized, /看《高等数学》/);
  assert.match(normalized, /\$x\^2\$/);
  assert.match(normalized, /<b>第一步：求导<\/b>/);
  assert.doesNotMatch(normalized, /《\/?(?:答案|分析|步骤)》|【思路分析】/);
});

test("code samples, mathematical text, ordinary book titles and prose labels are preserved exactly", () => {
  const code = '`《答案》【答案】《/答案》`\n\n```text\n《分析》【解析】《/分析》\n```';
  const formula = '$\\text{《答案》与【解析】} + x$';
  const literal = '参见《答案之书》和《答案》，由【解析】中的定义可知。';
  assert.equal(normalizeMathAnalysisContent(`${code}\n\n${formula}\n\n${literal}`), `${code}\n\n${formula}\n\n${literal}`);
  assert.equal(normalizeMathAnalysisContent('<pre>《答案》【答案】</pre>'), '<pre>《答案》【答案】</pre>');
});

test("known comments and conclusions keep their body, and genuinely empty blocks disappear", () => {
  const normalized = normalizeMathAnalysisContent('《注释》//极值判定：$f\'(0)=0$。前提不能省略。《/注释》\n《结论》【结论】所以选 B。《/结论》\n《点评》老师补充说明。《/点评》');
  assert.match(normalized, /极值判定：\$f'\(0\)=0\$/);
  assert.match(normalized, /所以选 B/);
  assert.match(normalized, /老师补充说明/);
  assert.doesNotMatch(normalized, /《\/?(?:注释|结论|点评)》/);
  assert.equal(normalizeMathAnalysisContent('《答案》【答案】《/答案》\n《分析》【解析】<p>&nbsp;<br></p>《/分析》'), '');
  assert.equal(normalizeMathAnalysisContent(null), '');
});
