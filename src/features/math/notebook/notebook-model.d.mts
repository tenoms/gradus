export function noteRecordId(row: Record<string, any>, origin?: string): string;
export function noteQuestionRow(
  row: Record<string, any>,
  origin?: string,
): Record<string, any>;
export function moveNotesPayload(
  ids: string[],
  catalogId: string | number,
): Record<string, any>;
export function sortCatalogPayload(
  rows: Record<string, any>[],
): Record<string, any>;
export function noteExportLinks(
  rows: Record<string, any>[],
  options: {
    origin?: string;
    kind?: string;
    stuid: string;
  },
): { name: string; count: number; url: string; recordIds: string[] }[];

export function notePrintHistoryParams(
  stuid: string,
  catalogId?: string | number,
): Record<string, any>;
export function noteWasPrinted(
  row: Record<string, any>,
  history: Record<string, any>[],
  origin?: string,
): boolean;
