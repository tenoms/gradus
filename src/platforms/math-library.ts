type Row = Record<string, any>;

// The combined VIP response omits BusType even for papers. The original
// papers page gets authoritative paper metadata from its own Model command.
export function mergeMathLibraryCatalog(all: Row[], papers: Row[]): Row[] {
  const paperById = new Map(papers.map((row) => [String(row.ID), row]));
  const merged = new Map<string, Row>();
  for (const row of all) {
    const paper = paperById.get(String(row.ID));
    merged.set(String(row.ID), {
      ...row,
      ...paper,
      BusType: paper ? "试卷" : row.BusType || "书籍",
    });
  }
  for (const row of papers)
    if (!merged.has(String(row.ID)))
      merged.set(String(row.ID), { ...row, BusType: "试卷" });
  return [...merged.values()];
}
