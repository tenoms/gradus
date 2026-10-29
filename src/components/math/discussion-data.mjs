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
  const [list, likes] = await Promise.all([
    get("/api/sys_comment/GetUser", {
      ID: qid,
      limit,
      page,
      SortDesc: order === "hot" ? "" : "1",
      StuID: page === 1 && order === "hot" ? stuid : "",
    }),
    command("GetUserCommentGiveList_lt", {
      StuID: stuid,
      PID: qid,
      Type: "题目讨论区",
      t: Date.now(),
    }),
  ]);
  // GetUser can retain pre-mutation counters even when its timestamp changes.
  // The original detail procedure returns the current count and deletion state.
  const fresh = await Promise.all(
    rows(list).map(async (row) => {
      const current = rows(
        await command("GetCommentInfoByID_lt", { ID: row.ID, t: Date.now() }),
      )[0];
      return current
        ? {
            ...row,
            Give: current.Give ?? row.Give,
            Count: current.Count ?? row.Count,
          }
        : null;
    }),
  );
  return [{ data: fresh.filter(Boolean) }, likes];
}
