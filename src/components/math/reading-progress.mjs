export function bookViewPayload({ stuid, qid, bookId, source }) {
  if (
    !stuid ||
    !qid ||
    !(Number(bookId) > 0) ||
    !["电子书", "练习册", "真题"].includes(source)
  )
    return;
  return {
    StuID: stuid,
    BusType: "02bf2d6b67684fce9d087e333cdcfcde",
    BusID: qid,
    BusValue: "1",
    System_Station_ID: 1,
    BookID: Number(bookId),
  };
}
