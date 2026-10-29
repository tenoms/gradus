import RichContent from "../../../shared/content/RichContent";
import { normalizeMathAnalysisContent } from "./math-analysis-content.mjs";

export default function MathAnalysisContent({ content, className = "" }: { content: unknown; className?: string }) {
  const normalized = normalizeMathAnalysisContent(content);
  return normalized ? <RichContent content={normalized} className={className} /> : null;
}
