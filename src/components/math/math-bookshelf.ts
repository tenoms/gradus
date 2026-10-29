import {
  mathApi,
  mathCommand,
  mathData,
  mathPost,
  mathRows,
} from "../../platforms/math";
export type ShelfRow = Record<string, any>;
export function shelfRows(response: any): ShelfRow[] {
  const d = mathData(response);
  return Array.isArray(d?.[0]) ? d[0] : mathRows(response);
}
export function shelfIds(value: any): string[] {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
export function shelfField(book: ShelfRow): "EBookIDs" | "PaperIDs" {
  return book.BusType === "试卷" ? "PaperIDs" : "EBookIDs";
}
export function changeShelfIds(
  existing: any,
  ids: (string | number)[],
  remove = false,
): string {
  return (
    remove
      ? shelfIds(existing).filter((id) => !ids.map(String).includes(id))
      : [...new Set([...shelfIds(existing), ...ids.map(String)])]
  ).join(",");
}
export function shelfProgress(row: ShelfRow) {
  const total = Number(row.QuestionSearchCount || 0),
    read = Number(row.StudentCount || 0);
  return {
    total,
    read,
    percent:
      total > 0
        ? Math.max(0, Math.min(100, Math.round((read / total) * 100)))
        : 0,
  };
}
export function shelfLastQuestion(
  row: ShelfRow | undefined,
): ShelfRow | undefined {
  return row
    ? {
        ...row,
        QuestionID: row.qID || row.QuestionID || row.ID,
        QuestionPage: row.questionPage || row.QuestionPage,
        QuestionSort: row.questionID || row.QuestionSort,
      }
    : undefined;
}
export function mergeShelfBooks(
  all: ShelfRow[],
  progress: ShelfRow[],
  user: ShelfRow,
): ShelfRow[] {
  const ids = [...shelfIds(user.EBookIDs), ...shelfIds(user.PaperIDs)];
  const paperIds = new Set(shelfIds(user.PaperIDs));
  return ids
    .map((id): ShelfRow | null => {
      const book = all.find((b) => String(b.ID) === id),
        plan = progress.find((p) => String(p.ID) === id);
      if (!book && !plan) return null;
      const merged = enrichShelfBooks([plan || book!], all)[0];
      return { ...merged, BusType: merged.BusType || (paperIds.has(id) ? "试卷" : "书籍") };
    })
    .filter((r): r is ShelfRow => r !== null);
}
/** Reading records are sparse; keep catalogue classification while retaining their progress. */
export function enrichShelfBooks(records: ShelfRow[], catalog: ShelfRow[]): ShelfRow[] {
  const byId = new Map(catalog.map(book => [String(book.ID), book]));
  return records.map(record => {
    const book = byId.get(String(record.ID));
    if (!book) return { ...record };
    const merged = { ...book };
    for (const [key, value] of Object.entries(record))
      if (value !== undefined && value !== null && value !== "") merged[key] = value;
    for (const key of ["BusType", "TeacherName"])
      if (book[key]) merged[key] = book[key];
    return merged;
  });
}
export const bookshelfApi = {
  async load(stuid: string) {
    const [profile, catalog, recent] = await Promise.all([
      mathCommand("GetUserInfoByStuID", { StuID: stuid, t: Date.now() }),
      mathApi.books(),
      mathCommand(
        "GetBookListCountAndLookCount_LastTop3",
        { StuID: stuid, System_Station_ID: 1 },
        true,
      ),
    ]);
    const rawUser = shelfRows(profile)[0] || {},
      user = Object.fromEntries(
        ["ID", "StuID", "EBookIDs", "PaperIDs", "SubjectType"].map((key) => [
          key,
          rawUser[key],
        ]),
      ),
      ids = [...shelfIds(user.EBookIDs), ...shelfIds(user.PaperIDs)];
    const progress = ids.length
      ? shelfRows(
          await mathCommand("GetBookListSysUserRecordPlan", {
            StuID: stuid,
            BookIDs: ids.join(","),
          }),
        )
      : [];
    return {
      user,
      books: shelfRows(catalog),
      shelf: mergeShelfBooks(shelfRows(catalog), progress, user),
      recent: enrichShelfBooks(shelfRows(recent), shelfRows(catalog)),
      progress,
    };
  },
  update(user: ShelfRow, field: "EBookIDs" | "PaperIDs", ids: string) {
    if (!user.ID) throw new Error("未能读取当前账号的书架信息，请刷新后重试。");
    return mathPost("/api/sys_users/Inner_sys_users", {
      ID: user.ID,
      [field]: ids,
      UpdateColumns: `ID,${field}`,
    });
  },
  lastQuestion: (StuID: string, BookID: string | number) =>
    mathCommand("GetUserLastViewByBook_math", { StuID, BookID }),
};
