export function courseAlbumAllowed(info, user, chapterCount, now = Date.now()) {
  if (chapterCount === 1) return true;
  if (Number(info?.Authority) === 1) {
    if (!info.FreeEndTime) return true;
    const text = String(info.FreeEndTime);
    return (
      Date.parse(
        /[zZ]|[+-]\d\d:\d\d$/.test(text)
          ? text
          : text.replace(" ", "T") + "+08:00",
      ) > now
    );
  }
  const text = String(user?.VipEndTime || "");
  return (
    !!text &&
    Date.parse(
      /[zZ]|[+-]\d\d:\d\d$/.test(text)
        ? text
        : text.replace(" ", "T") + "+08:00",
    ) > now
  );
}
export function courseAlbumTree(rows) {
  const copies = rows.map((row) => ({ ...row, children: [] })),
    byID = new Map(copies.map((row) => [String(row.ID), row]));
  for (const row of copies) {
    const parent = byID.get(String(row.PID));
    if (parent && parent !== row) parent.children.push(row);
  }
  return copies
    .filter(
      (row) =>
        !row.PID ||
        !byID.has(String(row.PID)) ||
        String(row.ID) === String(row.PID),
    )
    .sort((a, b) => Number(a.Sort || 0) - Number(b.Sort || 0));
}
export function courseAlbumWork(rows) {
  const result = [];
  const walk = (list) => {
    for (const row of list) {
      if (row.Type === "作业" && row.children?.length) {
        result.push({
          ...row.children[0],
          isTeacher: Number(row.BusValue) === 1,
        });
      } else if (row.Type === "作业" && row.BusID)
        result.push({ ...row, isTeacher: Number(row.BusValue) === 1 });
      else walk(row.children || []);
    }
  };
  for (const catalog of rows) walk(courseAlbumTree(catalog.ContentList || []));
  return result;
}

export function courseAlbumOperation(work, ordinary, teacher) {
  return Object.fromEntries(
    work.map((row) => {
      const matches = (row.isTeacher ? teacher : ordinary).filter(
        (record) =>
          String(row.isTeacher ? record.PaperID : record.BusID) ===
          String(row.BusID),
      );
      const done = row.isTeacher
        ? matches.some((record) => Number(record.TeacherState) === 1)
        : matches.some(
            (record) =>
              Number(record.IsFinished) === 1 &&
              Number(record.BusRelationID) === 0,
          );
      return [String(row.BusID), done ? 2 : matches.length ? 1 : 0];
    }),
  );
}
export function courseAlbumLog(
  context,
  AlbumID,
  CatalogID,
  BusID,
  previous = {},
  now = Date.now(),
) {
  const AddTime = new Date(now + 8 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  return Number(previous.ID) > 0
    ? { ID: previous.ID, BusID, AddTime, UpdateColumns: "ID,BusID,AddTime" }
    : {
        Type: "章节",
        CatalogID,
        AlbumID,
        StuID: context.stuid,
        System_Station_ID: 1,
        BusID,
        ProductID: context.ProductID || 0,
        CourseID: context.CourseID || 0,
      };
}
export function courseAlbumFeedback(
  context,
  AlbumID,
  CatalogID,
  types,
  content,
  images,
) {
  if (!types.length) throw new Error("请选择专辑错误类型");
  if (String(content).trim().length < 5)
    throw new Error("请补充至少5个字的说明");
  if (!images.length) throw new Error("请上传错误描述图片");
  return {
    BusType: 8,
    Type: 3,
    StuID: context.stuid,
    BusID: CatalogID,
    BusValue: types.join(","),
    Content: content.trim(),
    System_Station_ID: 1,
    BusNumber: 0,
    Notes: images.join(","),
    BaseType: "专辑反馈",
    BusParms: `AlbumID=${AlbumID}&CatalogID=${CatalogID}`,
  };
}
