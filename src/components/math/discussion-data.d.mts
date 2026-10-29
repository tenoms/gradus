export function loadDiscussionPage(options: {
  get: (path: string, query: Record<string, any>) => Promise<any>;
  command: (command: string, params: Record<string, any>) => Promise<any>;
  qid: string | number;
  stuid: string;
  order?: string;
  page?: number;
  limit?: number;
}): Promise<any[]>;
