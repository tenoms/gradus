export function bookViewPayload(context: {
  stuid: string;
  qid: string | number;
  bookId: string | number;
  source: string;
}): Record<string, any> | undefined;
