type Row = Record<string, any>;
export function relatedPackageRows(rows: Row[], owned: Row[]): Row[] {
  const ids = new Set(owned.map((r) => String(r.ID)));
  return rows
    .map((r) => ({
      ...r,
      owned: ids.has(String(r.ID)),
      books: (r._book_list || [])
        .map((b: Row) => ({ ...b, isFree: String(b.ID) === String(r.BusID) }))
        .sort(
          (a: Row, b: Row) =>
            Number(b.isFree) - Number(a.isFree) ||
            Number(b.BookYear || 0) - Number(a.BookYear || 0),
        ),
    }))
    .sort((a: Row, b: Row) => Number(a.Sort || 0) - Number(b.Sort || 0));
}
