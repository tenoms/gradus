type Row = Record<string, any>;

const paperTags = ["考研真题", "模拟试卷", "396真题"];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const isPaper = (row: Row) => row.BusType === "试卷" || (!row.BusType && ["396真题", "模拟试卷", "超级真题", "考研真题", "历年真题"].includes(text(row.TeacherName)));

/** TeacherName is the original mini-program's material label, not the exam subject. */
export function mathLibraryTag(row: Row): string {
  const teacher = text(row.TeacherName);
  if (!isPaper(row))
    return teacher || text(row.BookAuthor) || text(row.Author) || "其他教辅";
  if (teacher === "396真题") return "396真题";
  if (teacher === "模拟试卷") return "模拟试卷";
  // Super papers collect earlier exam papers and remain in the exam-paper category.
  if (["超级真题", "考研真题", "历年真题"].includes(teacher)) return "考研真题";
  const title = [row.Name, row.BookName].map(text).join(" ");
  if (/(?:^|[^\d])396(?:[^\d]|$)/.test(title)) return "396真题";
  if (/模拟|模考|(?:测试|测评)(?:试)?卷/.test(title)) return "模拟试卷";
  return "考研真题";
}

export function mathBookLabels(row: Row): { kind: "material" | "subject" | "edition"; label: string }[] {
  const subject = text(row.BusValue) || text(row.SubjectType);
  const year = ["number", "string"].includes(typeof row.BookYear)
    ? String(row.BookYear).trim().match(/^([12]\d{3})(?:年(?:版)?|版)?$/)?.[1]
    : undefined;
  const labels: ReturnType<typeof mathBookLabels> = [{ kind: "material", label: mathLibraryTag(row) }];
  if (subject) labels.push({ kind: "subject", label: subject });
  if (year) labels.push({ kind: "edition", label: `${year}年版` });
  return labels.filter((item, index) => labels.findIndex(other => other.label === item.label) === index);
}

export function matchesMathBookSearch(row: Row, query: string): boolean {
  const searchable = [row.Name, row.BookName, row.Author, row.BookAuthor, row.TeacherName,
    row.PublishingHouse, row.BusValue, row.SubjectType, row.BookYear, ...mathBookLabels(row).map(item => item.label)]
    .join(" ").toLowerCase();
  return query.toLowerCase().split(/[\s,，;；]+/).filter(Boolean).every(word => searchable.includes(word));
}

export function matchesMathLibraryTag(row: Row, kind = "全部", tag = ""): boolean {
  if (kind === "教辅" && isPaper(row)) return false;
  if (kind === "真题" && !isPaper(row)) return false;
  return !tag || tag === "全部标签" || mathLibraryTag(row) === tag;
}

/** Counts describe the supplied search/subject/year scope, before choosing a tag. */
export function mathLibraryTagOptions(rows: Row[], kind = "全部"): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!matchesMathLibraryTag(row, kind)) continue;
    const tag = mathLibraryTag(row);
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const order = (tag: string) => paperTags.includes(tag) ? 100 + paperTags.indexOf(tag) : tag === "其他教辅" ? 99 : 0;
  return [...counts].sort(([a], [b]) => order(a) - order(b)).map(([label, count]) => ({ label, count }));
}

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
