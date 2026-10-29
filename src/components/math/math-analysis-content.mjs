const names = "答案|解析|分析|步骤|注释|结论|其他|点评";
const aliases = {
  答案: "答案|参考答案",
  解析: "解析|分析|思路分析",
  分析: "解析|分析|思路分析",
  步骤: "步骤",
  注释: "注释",
  结论: "结论",
  其他: "其他",
  点评: "点评",
};
const meaningful = value => /<(?:img|svg|math)\b/i.test(value) || !!value
  .replace(/<[^>]*>/g, "")
  .replace(/&(?:nbsp|#160|#x0*a0);/gi, " ")
  .replace(/[\s\u200b\ufeff\\]/g, "");

/** The mini program's display markers are structure, not part of the explanation. */
export function normalizeMathAnalysisContent(value) {
  let source = value == null ? "" : String(value);
  const protectedContent = [];
  // Keep examples and TeX exact; labels inside a formula or a code sample are literal.
  source = source.replace(
    /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|<pre\b[^>]*>[\s\S]*?<\/pre>|<code\b[^>]*>[\s\S]*?<\/code>|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|(?<!\\)\$[^$]+?\$/gi,
    text => `\uE100ANALYSIS${protectedContent.push(text) - 1}\uE101`,
  );
  const section = new RegExp(`《(${names})》([\\s\\S]*?)《/\\1》`, "g");
  source = source.replace(section, (match, name, body, offset, full) => {
    const prefix = new RegExp(`^(?:\\s*【(?:${aliases[name]})】)+\\s*`);
    const content = body.replace(prefix, "").trim();
    // Some answers put their value immediately after an empty label wrapper.
    const following = full.slice(offset + match.length).split(new RegExp(`《/?(?:${names})》`))[0];
    if (!meaningful(content) && !meaningful(following)) return "\n\n";
    const heading = name === "步骤" || name === "其他" ? "" : `<strong>${name === "分析" ? "解析" : name}</strong>\n\n`;
    return `\n\n${heading}${content}\n\n`;
  });
  source = source
    .replace(/(^|\n)(?:[ \t]*【(?:答案|参考答案)】)+[ \t]*/g, "$1<strong>答案</strong> ")
    .replace(/(^|\n)(?:[ \t]*【(?:解析|分析|思路分析)】)+[ \t]*/g, "$1<strong>解析</strong> ")
    .replace(/(^|\n)[ \t]*\\[ \t]*(?=\n|$)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return source.replace(/\uE100ANALYSIS(\d+)\uE101/g, (_, index) => protectedContent[Number(index)]);
}
