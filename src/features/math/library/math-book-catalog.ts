import type { MathRow } from "../api/math";

export interface BookCatalogChapter {
  key: string;
  title: string;
  questions: MathRow[];
}

export interface BookCatalogPart {
  key: string;
  title: string;
  chapters: BookCatalogChapter[];
}

const label = (value: unknown) => value == null ? "" : String(value).trim();

/** Preserve first-seen chapters and each chapter's question order without guessing missing labels. */
export function groupBookCatalog(rows: MathRow[]): BookCatalogPart[] {
  const parts: BookCatalogPart[] = [];
  let part: BookCatalogPart | undefined;
  let chaptersByTitle = new Map<string, BookCatalogChapter>();
  for (const row of rows) {
    const title = label(row.BookChapter) || part?.title || "全书";
    if (!part || part.title !== title) {
      part = { key: `part-${parts.length}`, title, chapters: [] };
      parts.push(part);
      chaptersByTitle = new Map();
    }

    const chapterTitle = label(row.ChapterName) || "未标注章节";
    let chapter = chaptersByTitle.get(chapterTitle);
    if (!chapter) {
      chapter = { key: `${part.key}-chapter-${part.chapters.length}`, title: chapterTitle, questions: [] };
      part.chapters.push(chapter);
      chaptersByTitle.set(chapterTitle, chapter);
    }
    chapter.questions.push(row);
  }
  return parts;
}

export function findBookCatalogChapter(
  parts: BookCatalogPart[],
  questionId: string | number | undefined,
): { part: BookCatalogPart; chapter: BookCatalogChapter } | undefined {
  if (questionId === undefined || questionId === "") return;
  for (const part of parts)
    for (const chapter of part.chapters)
      if (chapter.questions.some(row => String(row.QuestionID ?? row.qID ?? row.ID) === String(questionId)))
        return { part, chapter };
}
