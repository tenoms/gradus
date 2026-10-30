const data = (response) =>
  response && typeof response === "object" && Object.hasOwn(response, "data")
    ? response.data
    : response;
const rows = (response) => {
  const value = data(response);
  return Array.isArray(value)
    ? Array.isArray(value[0])
      ? value[0]
      : value
    : [];
};
export async function loadDiscussionPage({
  get,
  command,
  qid,
  stuid,
  order = "hot",
  page = 1,
  limit = 20,
}) {
  const list = await get("/api/sys_comment/GetUser", {
    ID: qid,
    limit,
    page,
    SortDesc: order === "hot" ? "" : "1",
    StuID: page === 1 && order === "hot" ? stuid : "",
  });
  // Cached lists can retain old reply counts and comments deleted at the source.
  const fresh = await Promise.all(
    rows(list).map(async (row) => {
      const current = rows(
        await command("GetCommentInfoByID_lt", { ID: row.ID, t: Date.now() }),
      )[0];
      return current
        ? {
            ...row,
            Count: current.Count ?? row.Count,
          }
        : null;
    }),
  );
  return { data: fresh.filter(Boolean) };
}
