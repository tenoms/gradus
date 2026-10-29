type Row = Record<string, any>;
export function mathFrequencyRows(rows: Row[]): Row[] {
  return rows.map((r) => {
    const years = String(r.Years || "")
      .split(",")
      .map((v) => {
        const [y, s] = v.split(":");
        return { year: Number(y), score: Number(s) };
      })
      .filter((v) => v.year > 0 && Number.isFinite(v.score));
    return {
      ...r,
      years,
      maxYear: years.length ? Math.max(...years.map((v) => v.year)) : undefined,
    };
  });
}
export function mathCapacityPayload(
  stuid: string,
  bookId: string | number,
  qid: string | number,
  level: number,
) {
  if (![1, 2, 3].includes(level)) throw new Error("请选择实际掌握程度");
  return {
    Level: level,
    StuID: stuid,
    System_Station_ID: 1,
    BookID: bookId,
    QuestionID: qid,
  };
}
