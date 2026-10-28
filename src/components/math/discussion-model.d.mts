export function discussionReplyPayload(input: {
  qid: string | number;
  stuid: string;
  text: string;
  files?: string[];
  target?: Record<string, any>;
  busType?: string;
}): Record<string, any>;
export function discussionTree(
  rows: Record<string, any>[],
  rootId: string | number,
): Record<string, any>[];
export function discussionGivePayload(
  row: Record<string, any>,
  liked: boolean,
): Record<string, any>;
export function feedbackPayload(input: {
  qid: string | number;
  stuid: string;
  bookId?: number;
  types: string[];
  content: string;
  images: string[];
  answerImages?: string[];
  baseType?: string;
}): Record<string, any>;
