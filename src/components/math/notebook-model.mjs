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
export function notePrintLogRecords(rows, { origin = "book", stuid }) {
  return rows.map((row) => {
    const qid = origin === "bank" ? row.QID || row.QuestionID : row.QuestionID;
    if (!qid) throw new Error("当前记录缺少题目编号，无法登记导出。");
    return {
      BusValue: "收藏错题打印",
      Question_ID: qid,
      BusKey: row.CatalogID || 0,
      BookID: row.bookID ?? row.BookID ?? 0,
      System_Station_ID: 1,
      StuID: stuid,
      BusID: qid,
    };
  });
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
  { origin = "book", kind = "错题", stuid, vip = false, downloadCount = 0 },
) {
  if (!rows.length) throw new Error("请先选择需要导出的记录。");
  if (!vip && Number(downloadCount) > 100)
    throw new Error("当前账号的下载额度已用完。");
  if (!vip && rows.length > 6) throw new Error("当前账号每次最多导出 6 道题。");
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
          saasid: "1",
          stuid,
          busindex: origin === "bank" ? "2" : "1",
          issort: "0",
          catalogids: batch
            .map((r) => (origin === "bank" ? r.QID : r.ID))
            .join(","),
        });
      if (origin === "book") params.set("buskey", catalog);
      result.push({
        name:
          origin === "bank" ? "题库记录" : batch[0].CatalogName || "笔记分类",
        count: batch.length,
        recordIds: batch.map((row) => noteRecordId(row, origin)),
        url: `https://web.math-upstream.invalid/External/UserRecordLatex.html?${params}`,
      });
    }
  }
  return result;
}
