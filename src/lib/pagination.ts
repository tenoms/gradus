import { useEffect, useState } from "react";
import { paginationState } from "./pagination-model.mjs";

export function usePagination({ total, pageSize: initialPageSize = 20, resetKey }: { total: number; pageSize?: number; resetKey?: unknown }) {
  const [selection, setSelection] = useState({ page: 1, pageSize: initialPageSize, key: resetKey });
  const state = paginationState({ page: Object.is(selection.key, resetKey) ? selection.page : 1, pageSize: selection.pageSize, total });
  useEffect(() => {
    setSelection(previous => {
      const page = Object.is(previous.key, resetKey) ? paginationState({ page: previous.page, pageSize: previous.pageSize, total }).page : 1;
      return page === previous.page && Object.is(previous.key, resetKey) ? previous : { ...previous, key: resetKey, page };
    });
  }, [resetKey, total]);
  return { ...state,
    setPage: (page: number) => setSelection(previous => ({ ...previous, key: resetKey, page: paginationState({ page, pageSize: previous.pageSize, total }).page })),
    setPageSize: (size: number) => setSelection({ key: resetKey, page: 1, pageSize: Math.max(1, size) }),
  };
}
