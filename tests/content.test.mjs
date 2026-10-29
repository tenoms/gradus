import test from "node:test";
import assert from "node:assert/strict";
import { formatLearningContent } from "../src/shared/content/content.mjs";

test("math platform multiline inline formulas render without exposing the original TeX delimiters", () => {
  const html = formatLearningContent(
    "值域即 $R_f=\\left\\{ y|y=f(x),x\\in D \\right\\}\n$\n下一段",
  );
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /\$R_f/);
  assert.match(html, /下一段/);
});
test("towxml Markdown images, headings, lists and emphasis remain readable alongside formulas", () => {
  const html = formatLearningContent(
    "## 学习说明\n\n**关键步骤**：$x_1^2$\n\n- 第一步\n- 第二步\n\n![示意图](https://example.com/figure.png)",
  );
  assert.match(html, /<h2>学习说明<\/h2>/);
  assert.match(html, /<strong>关键步骤<\/strong>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<img src="https:\/\/example.com\/figure.png"/);
  assert.match(html, /class="katex"/);
});
test("code examples retain dollar signs and are never treated as mathematics", () => {
  const html = formatLearningContent(
    '`$value$`\n\n```c\nprintf("$amount$");\n```',
  );
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /<code>\$value\$<\/code>/);
  assert.match(html, /\$amount\$/);
});
test("existing HTML and MathJax delimiters from computer platform both render", () => {
  const html = formatLearningContent(
    '<p>复杂度 <span class="math-tex">\\(O(n^2)\\)</span></p>',
  );
  assert.match(html, /<p>复杂度/);
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /\\\(O/);
});
