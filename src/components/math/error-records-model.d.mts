export function errorRecordQuery(
  qid: string | number,
  page?: number,
): Record<string, any>;
export function errorEvidence(value: any): string[];
export function errorRecordStatus(type: any): string;
export function errorRecord(row: Record<string, any>): Record<string, any>;
export function errorVotePayload(
  row: Record<string, any>,
  stuid: string,
  state: number,
): Record<string, any> | null;
export function acknowledgedErrorVote(
  row: Record<string, any>,
  state: number,
  data: any,
): Record<string, any>;
