export function paginationState({ page = 1, pageSize = 20, total = 0 }) {
  const size = Math.max(1, Math.floor(Number(pageSize) || 20));
  const count = Math.max(0, Math.floor(Number(total) || 0));
  const pageCount = Math.max(1, Math.ceil(count / size));
  const current = Math.min(pageCount, Math.max(1, Math.floor(Number(page) || 1)));
  return { page: current, pageSize: size, total: count, pageCount, start: (current - 1) * size, end: Math.min(current * size, count) };
}

export function paginationPages(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const first = page <= 4 ? 2 : Math.max(2, page - 1);
  const last = page >= pageCount - 3 ? pageCount - 1 : Math.min(pageCount - 1, Math.max(5, page + 1));
  const start = page >= pageCount - 3 ? Math.min(first, pageCount - 4) : first;
  const result = [1];
  if (start > 2) result.push("ellipsis");
  for (let value = start; value <= last; value++) result.push(value);
  if (last < pageCount - 1) result.push("ellipsis");
  result.push(pageCount);
  return result;
}
