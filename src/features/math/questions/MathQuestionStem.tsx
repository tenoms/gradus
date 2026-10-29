import RichContent from "../../../shared/content/RichContent";
import { hasMathQuestionContent } from "./math-question-presentation.mjs";

/** Shows a question once, keeping its source scan available as an optional reference. */
export default function MathQuestionStem({ content, image, emptyText = "当前题目未返回可显示的题干。" }: { content?: unknown | unknown[]; image?: unknown; emptyText?: string }) {
  const blocks = (Array.isArray(content) ? content : [content]).filter(hasMathQuestionContent);
  const source = typeof image === "string" && /^https?:\/\//i.test(image.trim()) ? image.trim() : "";
  const imageAlreadyInContent = !!source && blocks.some(block => String(block).includes(source) || String(block).includes(source.replace(/&/g, "&amp;")));
  return <div className="math-question-stem">
    {blocks.map((block, index) => <RichContent key={index} content={block} />)}
    {source && !imageAlreadyInContent && (blocks.length ? <details className="math-original-question"><summary>查看原题图片</summary><img className="math-question-image" src={source} alt="原题图片" loading="lazy" /></details> : <img className="math-question-image" src={source} alt="原题图片" loading="lazy" />)}
    {!blocks.length && !source && emptyText && <p className="math-muted">{emptyText}</p>}
  </div>;
}
