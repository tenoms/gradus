import DOMPurify from "dompurify";
import { formatLearningContent } from "../lib/content.mjs";
import "katex/dist/katex.min.css";
export default function RichContent({
  content,
  className = "",
}: {
  content: unknown;
  className?: string;
}) {
  return (
    <div
      className={`rich-content ${className}`}
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(formatLearningContent(content), {
          ADD_TAGS: [
            "math",
            "semantics",
            "mrow",
            "mi",
            "mo",
            "mn",
            "msup",
            "mfrac",
            "msqrt",
            "annotation",
          ],
          ADD_ATTR: ["target", "display", "aria-hidden"],
        }),
      }}
    />
  );
}
