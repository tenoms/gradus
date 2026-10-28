export function discussionReplyPayload({
  qid,
  stuid,
  text,
  files = [],
  target,
  busType = "题目讨论区",
}) {
  let PID = 0,
    Level = 1,
    ReplyID = 0,
    Quote = "";
  if (target) {
    const level = Number(target.Level || 1);
    PID = level === 1 ? target.ID : level === 2 ? target.ID : target.PID;
    Level = level === 1 ? 2 : 3;
    ReplyID = target.ID;
    Quote = target.StuID || "";
  }
  return {
    StuID: stuid,
    Txt: text.trim(),
    PID,
    Level,
    BusType: busType,
    BusID: qid,
    System_Station_ID: 1,
    Files: files.join(","),
    Quote,
    ReplyID,
  };
}
export function discussionTree(rows, rootId) {
  const copies = rows.map((r) => ({ ...r, children: [] }));
  const byId = new Map(copies.map((r) => [String(r.ID), r]));
  const roots = [];
  for (const row of copies) {
    const parent = byId.get(String(row.PID));
    if (String(row.PID) === String(rootId) || !parent) roots.push(row);
    else parent.children.push(row);
  }
  return roots;
}
export function discussionGivePayload(row, liked) {
  return liked
    ? { ID: row.ID, Give: -1 }
    : { ID: row.ID, Give: 1, StuID: row.StuID };
}
export function feedbackPayload({
  qid,
  stuid,
  bookId = 0,
  types,
  content,
  images,
  answerImages = [],
  baseType = "题目",
}) {
  return {
    BusType: 1,
    Type: 3,
    StuID: stuid,
    BusID: qid,
    BusValue: types.join(","),
    Content: content,
    System_Station_ID: 1,
    BusNumber: 0,
    Notes: images.join(","),
    AnswerImg: answerImages.join(","),
    BookID: bookId,
    BaseType: baseType,
  };
}
