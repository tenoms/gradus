export interface PaginationState { page: number; pageSize: number; total: number; pageCount: number; start: number; end: number }
export function paginationState(options: { page?: number; pageSize?: number; total?: number }): PaginationState;
export function paginationPages(page: number, pageCount: number): (number | "ellipsis")[];
