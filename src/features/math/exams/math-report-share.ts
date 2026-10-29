import DOMPurify from "dompurify";
import {
  reportSnapshotDocument,
  safeReportSnapshotImage,
} from "./report-share-model.mjs";

const excluded =
  "button,input,select,textarea,form,video,audio,source,track,iframe,object,embed,script,noscript,style,link,meta,base,template,foreignObject,animate,animateMotion,animateTransform,set,[data-report-share-ignore]";
const styleProperties = [
  "display",
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "text-align",
  "text-decoration",
  "white-space",
  "overflow-wrap",
  "word-break",
  "border",
  "border-radius",
  "padding",
  "margin",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "align-items",
  "justify-content",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "min-height",
  "vertical-align",
  "fill",
  "stroke",
  "stroke-width",
] as const;

/** Creates a passive copy of the report already rendered in this browser. */
export function reportSnapshotContent(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  const originals: Element[] = [root, ...root.querySelectorAll("*")];
  const copies: Element[] = [copy, ...copy.querySelectorAll("*")];
  for (let index = 0; index < originals.length; index++) {
    const original = originals[index],
      cloned = copies[index];
    const excludedParent = original.closest(excluded);
    if (
      !cloned ||
      (excludedParent &&
        !excludedParent.matches("button.mer-recommend,.mer-rhythm button"))
    )
      continue;
    const computed = root.ownerDocument.defaultView?.getComputedStyle(original);
    cloned.removeAttribute("style");
    const style = (cloned as HTMLElement | SVGElement).style;
    if (style && computed) {
      for (const property of styleProperties) {
        const value = computed.getPropertyValue(property);
        if (value && !/url\s*\(|expression\s*\(/i.test(value))
          style.setProperty(property, value);
      }
      const width = (original as HTMLElement).style?.width;
      const height = (original as HTMLElement).style?.height;
      if (width && /^(?:\d+(?:\.\d+)?)(?:%|px|em|rem)$/.test(width))
        style.width = width;
      if (height && /^(?:\d+(?:\.\d+)?)(?:px|em|rem)$/.test(height))
        style.height = height;
      else if (
        original instanceof HTMLElement &&
        !["IMG", "CANVAS"].includes(original.tagName) &&
        !original.textContent?.trim()
      ) {
        // Report bars and tracks often get their height from the app stylesheet.
        const chartHeight = computed.getPropertyValue("height");
        if (/^\d+(?:\.\d+)?px$/.test(chartHeight)) style.height = chartHeight;
      }
    }
    if (original instanceof HTMLImageElement) {
      const src = safeReportSnapshotImage(
        original.currentSrc || original.getAttribute("src"),
        root.ownerDocument.baseURI,
      );
      if (src) {
        cloned.setAttribute("src", src);
        cloned.setAttribute("loading", "eager");
      } else cloned.removeAttribute("src");
    }
    if (original instanceof HTMLCanvasElement) {
      const image = root.ownerDocument.createElement("img");
      image.alt = original.getAttribute("aria-label") || "报告图表";
      image.setAttribute("style", cloned.getAttribute("style") || "");
      try {
        image.src = original.toDataURL("image/png");
        cloned.replaceWith(image);
      } catch {
        const note = root.ownerDocument.createElement("p");
        note.textContent = `${image.alt}：当前图表无法嵌入快照，请同时保留其下方的数据。`;
        note.className = "report-snapshot-unavailable";
        cloned.replaceWith(note);
      }
    }
  }
  // These source report buttons contain chart values or recommended topics.
  for (const button of copy.querySelectorAll(
    "button.mer-recommend,.mer-rhythm button",
  )) {
    const block = root.ownerDocument.createElement("div");
    block.className = button.className;
    block.setAttribute("style", button.getAttribute("style") || "");
    block.append(...button.childNodes);
    button.replaceWith(block);
  }
  // KaTeX renders both visual HTML and an accessible MathML copy. Native MathML
  // keeps formulas printable without exporting web fonts or duplicating them.
  for (const formula of copy.querySelectorAll(".katex")) {
    const math = formula.querySelector(".katex-mathml math");
    if (math) {
      math.setAttribute("style", 'font-family:math,"Cambria Math",serif');
      formula.replaceChildren(math);
    }
  }
  copy.querySelectorAll(excluded).forEach((element) => element.remove());
  for (const anchor of copy.querySelectorAll("a")) {
    const text = root.ownerDocument.createElement("span");
    text.append(...anchor.childNodes);
    anchor.replaceWith(text);
  }
  for (const details of copy.querySelectorAll("details")) details.open = true;
  for (const element of [copy, ...copy.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      if (
        /^on/i.test(attribute.name) ||
        /^data-/i.test(attribute.name) ||
        /^(?:href|xlink:href|srcset|poster|ping|action|formaction|tabindex|contenteditable|autofocus)$/i.test(
          attribute.name,
        )
      )
        element.removeAttribute(attribute.name);
    }
  }
  return DOMPurify.sanitize(copy.outerHTML, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: [
      "button",
      "input",
      "select",
      "textarea",
      "form",
      "video",
      "audio",
      "source",
      "track",
      "iframe",
      "object",
      "embed",
      "script",
      "noscript",
      "style",
      "link",
      "meta",
      "base",
      "template",
      "foreignObject",
      "animate",
      "animateMotion",
      "animateTransform",
      "set",
    ],
    FORBID_ATTR: [
      "href",
      "xlink:href",
      "srcset",
      "poster",
      "ping",
      "action",
      "formaction",
      "tabindex",
      "contenteditable",
      "autofocus",
    ],
  });
}

export function createMathReportSnapshot(
  root: HTMLElement,
  title?: string,
  now = new Date(),
): Blob {
  return new Blob(
    [reportSnapshotDocument(title, reportSnapshotContent(root), now)],
    { type: "text/html;charset=utf-8" },
  );
}
