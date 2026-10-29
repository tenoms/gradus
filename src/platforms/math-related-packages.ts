type Row = Record<string, any>;
export function relatedPackageRows(rows: Row[]): Row[] {
  return rows.map(row => ({
    ...row,
    books: [...(row._book_list || [])].sort((a: Row, b: Row) => Number(b.BookYear || 0) - Number(a.BookYear || 0)),
  })).sort((a: Row, b: Row) => Number(a.Sort || 0) - Number(b.Sort || 0));
}
