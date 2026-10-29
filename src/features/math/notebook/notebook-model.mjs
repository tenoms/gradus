import { mathExternalUrl, publicConfig } from "../../../shared/config/public.mjs";

export function noteRecordId(row, origin = "book") {
  return String(origin === "bank" ? (row.RelD ?? row.RelID ?? row.ID) : row.ID);
}
export function noteQuestionRow(row, origin = "book") {
  return {
    ...row,
    QuestionID: origin === "bank" ? row.QID || row.QuestionID : row.QuestionID,
    BookID: row.BookID ?? row.bookID ?? 0,
  };
}
export function moveNotesPayload(ids, catalogId) {
  return {
    UpdateIds: ids.join(","),
    CatalogID: Number(catalogId),
    UpdateColumns: "CatalogID",
  };
}
export function sortCatalogPayload(rows) {
  return {
    Content: JSON.stringify(
      rows.map((r, index) => ({ ID: r.ID, Sort: index })),
    ),
  };
}
export function notePrintHistoryParams(stuid, catalogId = 0) {
  return { StuID: stuid, BusKey: Number(catalogId) || 0 };
}
export function noteWasPrinted(row, history, origin = "book") {
  const qid = origin === "bank" ? row.QID || row.QuestionID : row.QuestionID,
    book = row.bookID ?? row.BookID ?? 0;
  return history.some(
    (item) =>
      String(item.Question_ID) === String(qid) &&
      String(item.BookID || 0) === String(book),
  );
}
export function noteExportLinks(
  rows,
  { origin = "book", kind = "错题", stuid },
) {
  if (!rows.length) throw new Error("请先选择需要导出的记录。");
  if (!publicConfig.math.externalUrl) return [];
  const groups = new Map();
  for (const row of rows) {
    const key = origin === "bank" ? "" : String(row.CatalogID || 0);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const result = [];
  for (const [catalog, items] of groups) {
    for (let offset = 0; offset < items.length; offset += 30) {
      const batch = items.slice(offset, offset + 30),
        params = new URLSearchParams({
          bustype: kind,
          saasid: String(publicConfig.math.printStationId),
          stuid,
          busindex: origin === "bank" ? "2" : "1",
          issort: "0",
          catalogids: batch
            .map((r) => (origin === "bank" ? r.QID : r.ID))
            .join(","),
        });
      if (origin === "book") params.set("buskey", catalog);
      const url = mathExternalUrl("UserRecordLatex.html");
      url.search = params.toString();
      result.push({
        name:
          origin === "bank" ? "题库记录" : batch[0].CatalogName || "笔记分类",
        count: batch.length,
        recordIds: batch.map((row) => noteRecordId(row, origin)),
        url: url.href,
      });
    }
  }
  return result;
}
