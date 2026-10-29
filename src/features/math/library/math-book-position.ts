import { api } from "../../../shared/api/client";
import { mathQuestionId } from "../api/math";
import type { MathRow } from "../api/math";
import { bookshelfApi, shelfLastQuestion, shelfRows } from "./math-bookshelf";

export async function loadBookPosition(stuid: string, bookId: string | number): Promise<MathRow | undefined> {
  const { position } = await api(`/api/platform/math/books/${encodeURIComponent(bookId)}/position`);
  if (position) return position;
  return shelfLastQuestion(shelfRows(await bookshelfApi.lastQuestion(stuid, bookId))[0]);
}

export function saveBookPosition(bookId: string | number, row: MathRow) {
  return api(`/api/platform/math/books/${encodeURIComponent(bookId)}/position`, {
    method: "PUT",
    body: JSON.stringify({
      QuestionID: mathQuestionId(row),
      QuestionPage: row.QuestionPage,
      QuestionSort: row.QuestionSort,
    }),
  });
}
