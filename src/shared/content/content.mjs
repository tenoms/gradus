import katex from "katex";
import { marked } from "marked";

/** Formats the HTML, Markdown and TeX dialects returned by both learning APIs.
 * The caller sanitizes the resulting HTML before inserting it into the DOM. */
export function formatLearningContent(value) {
  let source = value == null ? "" : String(value);
  const code = [];
  source = source.replace(
    /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|<pre\b[^>]*>[\s\S]*?<\/pre>|<code\b[^>]*>[\s\S]*?<\/code>/gi,
    (text) => `\uE000STUDYCODE${code.push(text) - 1}\uE001`,
  );
  const equations = [];
  source = source.replace(
    /\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)|(?<!\\)\$([^$]+?)\$/g,
    (text, a, b, c, d) => {
      const expression = (a || b || c || d)
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ");
      let rendered;
      try {
        rendered = katex.renderToString(expression, {
          throwOnError: false,
          displayMode: !!(a || b),
          strict: false,
          trust: false,
        });
      } catch {
        rendered = text;
      }
      return `\uE000STUDYMATH${equations.push(rendered) - 1}\uE001`;
    },
  );
  source = source.replace(
    /\uE000STUDYCODE(\d+)\uE001/g,
    (_, index) => code[Number(index)],
  );
  const html = marked.parse(source, { async: false, breaks: true, gfm: true });
  return html.replace(
    /\uE000STUDYMATH(\d+)\uE001/g,
    (_, index) => equations[Number(index)],
  );
}
