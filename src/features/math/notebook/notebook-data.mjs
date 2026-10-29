const value = (response) =>
  response && typeof response === "object" && Object.hasOwn(response, "data")
    ? response.data
    : response;
const rows = (response) => {
  const data = value(response);
  return Array.isArray(data) ? (Array.isArray(data[0]) ? data[0] : data) : [];
};

export async function loadBookNotes({
  get,
  command,
  stuid,
  kind,
  bookId = 0,
  catalogId = 0,
}) {
  const params = {
    StuID: stuid,
    Type: kind,
    BookID: Number(bookId) || 0,
    CatalogID: Number(catalogId) || 0,
  };
  if (Number(catalogId) > 0)
    return command("GetSysUserBookQuestionList", params);
  // CatalogID=0 selects uncategorized records in the source procedure, not all categories.
  const query = {
    StuID: stuid,
    Type: kind,
    limit: 1000,
    page: 1,
    ...(Number(bookId) > 0 ? { BookID: Number(bookId) } : {}),
  };
  const [first, summary] = await Promise.all([
    get("/api/sys_user_book_question/GetListByPage", query),
    command("GetSysUserBookQuestionList", params),
  ]);
  const all = rows(first),
    total = Number(first?.count || all.length);
  for (let page = 2; all.length < total; page++) {
    const next = rows(
      await get("/api/sys_user_book_question/GetListByPage", {
        ...query,
        page,
      }),
    );
    if (!next.length) break;
    all.push(...next);
  }
  const summaryData = value(summary);
  // The generic record list has fresh note fields but no question preview.
  // Retrieve source joins only for categories present in these actual records.
  const categoryIds = [...new Set(all.map((row) => Number(row.CatalogID) || 0))]
    .filter((id) => id > 0);
  const joined = [rows(summary), ...await Promise.all(categoryIds.map(async (id) =>
    rows(await command("GetSysUserBookQuestionList", { ...params, CatalogID: id })),
  ))].flat();
  const details = new Map(joined.map((row) => [String(row.ID), row]));
  return {
    data: [all.map((row) => ({ ...details.get(String(row.ID)), ...row })),
      Array.isArray(summaryData?.[1]) ? summaryData[1] : []],
  };
}
