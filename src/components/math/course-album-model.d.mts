export function courseAlbumTree(
  rows: Record<string, any>[],
): Record<string, any>[];
export function courseAlbumWork(
  rows: Record<string, any>[],
): Record<string, any>[];
export function courseAlbumOperation(
  work: Record<string, any>[],
  ordinary: Record<string, any>[],
  teacher: Record<string, any>[],
): Record<string, number>;
export function courseAlbumLog(
  context: Record<string, any>,
  AlbumID: any,
  CatalogID: any,
  BusID: any,
  previous?: Record<string, any>,
  now?: number,
): Record<string, any>;
export function courseAlbumFeedback(
  context: Record<string, any>,
  AlbumID: any,
  CatalogID: any,
  types: string[],
  content: string,
  images: string[],
): Record<string, any>;
