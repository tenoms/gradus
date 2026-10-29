export function loadBookNotes(options: {
  get: (path: string, query: Record<string, any>) => Promise<any>;
  command: (command: string, params: Record<string, any>) => Promise<any>;
  stuid: string;
  kind: string;
  bookId?: string | number;
  catalogId?: string | number;
}): Promise<any>;
