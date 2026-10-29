const number = (value) => Number(value) || 0;
const timestamp = (value) => {
  if (typeof value === "number") return value;
  const text = String(value || "").replace(" ", "T");
  return (
    Date.parse(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(text)
        ? `${text}+08:00`
        : text,
    ) || 0
  );
};
export function recommendationRecordComplete(row) {
  const record = row?._c_course_users_record;
  return (
    !!record &&
    number(record.ID) > 0 &&
    [0, 1].includes(Number(record.AnswerState))
  );
}
export function recommendationGroups(rows, isSuper = false) {
  const sorted = [...rows].sort(
      (a, b) =>
        timestamp(a.AddTime) - timestamp(b.AddTime) ||
        timestamp(a.Diff) - timestamp(b.Diff) ||
        number(a.Sort) - number(b.Sort),
    ),
    map = new Map();
  for (const row of sorted) {
    if (!row.LinkSort || String(row.LinkSort) === "0") continue;
    const key = String(row.LinkSort);
    let group = map.get(key);
    if (!group) {
      group = {
        LinkSort: row.LinkSort,
        AddPerson: row.AddPerson || "考点突破",
        AddTime: row.AddTime,
        Sort: row.Sort,
        ErrorQuestionIDs: row.ErrorQuestionIDs,
        Files: row.Files,
        AnswerFiles: row.AnswerFiles,
        SpecialFiles: row.SpecialFiles,
        data: [],
      };
      map.set(key, group);
    }
    group.data.push(row);
  }
  const groups = [...map.values()];
  groups.sort((a, b) =>
    isSuper
      ? number(a.ErrorQuestionIDs) - number(b.ErrorQuestionIDs) ||
        number(a.Sort) - number(b.Sort)
      : timestamp(a.AddTime) - timestamp(b.AddTime) ||
        number(a.LinkSort) - number(b.LinkSort),
  );
  return groups.map((group) => {
    const count = group.data.filter(recommendationRecordComplete).length,
      correct = group.data.filter(
        (q) =>
          recommendationRecordComplete(q) &&
          Number(q._c_course_users_record.AnswerState) === 1,
      ).length;
    return {
      ...group,
      count,
      correct,
      isFinish: count === group.data.length,
      newCount: group.data.filter(
        (q) => timestamp(q.AddTime) - timestamp(group.data[0]?.AddTime) > 59999,
      ).length,
    };
  });
}
export function recommendationMetadata(
  groups,
  specialInfo,
  originalQuestions = [],
  isSuper = false,
) {
  const specialList = Array.isArray(specialInfo)
      ? specialInfo
      : specialInfo?.specialList || [],
    links = specialInfo?.QuestionListFiles || [],
    existing = new Set(groups.map((g) => String(g.LinkSort))),
    stars = ["", "一星", "二星", "三星", "四星", "五星"],
    frequencies = ["", "低", "中", "高"];
  return {
    groups: groups.map((group) => {
      const info = specialList.find(
        (s) => String(s.ID) === String(group.LinkSort),
      );
      return info
        ? {
            ...group,
            SpecialFiles: info.Files || group.SpecialFiles,
            ND: isSuper ? "" : stars[number(info.BusValue)] || "",
            KP: isSuper ? "" : frequencies[number(info.Type)] || "",
          }
        : group;
    }),
    topics: originalQuestions
      .map((question) => ({
        ...question,
        specialList: links
          .filter((l) => String(l.QuestionID) === String(question.QuestionID))
          .flatMap((link) =>
            specialList
              .filter((s) => String(s.ID) === String(link.BusID))
              .map((s) => ({ ...s, existing: existing.has(String(s.ID)) })),
          ),
      }))
      .filter((q) => q.specialList.length),
  };
}
export function recommendationOptions(question) {
  const value =
    question.options || question.QuestionOption || question.Option || [];
  return (Array.isArray(value) ? value : []).filter(
    (o) => o.Type === "选项" || !o.Type,
  );
}
export function recommendationOptionCorrect(options, answer) {
  const expected = options
      .filter((o) => number(o.IsAnswer) === 1)
      .map((o) => String(o.ID))
      .sort(),
    actual = String(answer || "")
      .split(",")
      .filter(Boolean)
      .sort();
  return (
    expected.length > 0 &&
    actual.length > 0 &&
    expected.join(",") === actual.join(",")
  );
}
export function buildRecommendationRecord(
  context,
  question,
  answer = "",
  correct = 0,
) {
  const old = question._c_course_users_record || {},
    options = recommendationOptions(question),
    objective = options.length > 0;
  return {
    ID: old.ID || 0,
    StuID: context.stuid,
    CourseID: context.CourseID,
    CalendarID: context.CalendarID,
    BusType: 3,
    BusID: context.PaperID,
    BusValue: objective ? 0 : (old.BusValue ?? ""),
    Answer: objective ? answer : old.Answer || "",
    AnswerState: objective
      ? recommendationOptionCorrect(options, answer)
        ? 1
        : 0
      : Number(correct) === 1
        ? 1
        : 0,
    BusRelationID: question.QuestionID || question.ID,
    BookID: question._question_list?.BookID || question.BookID || 0,
    ProductID: number(context.ProductID),
  };
}
export function recommendationCompletion(context) {
  return {
    ID: 0,
    StuID: context.stuid,
    CourseID: context.CourseID,
    CalendarID: context.CalendarID,
    BusType: 3,
    BusID: context.PaperID,
    BusValue: 0,
    AnswerState: 1,
    BusRelationID: 0,
    IsFinished: 1,
    ProductID: number(context.ProductID),
  };
}
export function recommendationAppend(context, meta, Links) {
  if (!meta.RelatedID)
    throw new Error("原始测评关联信息缺失，暂时无法追加题目。");
  if (!Links || String(Links) === "0") throw new Error("请先选择一个专题。");
  return {
    ID: meta.RelatedID,
    PaperID: context.PaperID,
    RelatedStuID: context.stuid,
    BusID: context.CalendarID,
    CalendarID: context.CalendarID,
    IsSpecial: 1,
    Links,
    ...(context.isSuper ? {} : { ProductID: context.ProductID }),
  };
}
export function recommendationSavedRecord(payload, response) {
  const value =
      response && typeof response === "object"
        ? response.ID || response.id
        : response,
    id = number(payload.ID) || number(value);
  return { ...payload, ID: id };
}
export function recommendationUpdate(rows, questionId, record) {
  return rows.map((q) =>
    String(q.QuestionID || q.ID) === String(questionId)
      ? { ...q, _c_course_users_record: record }
      : q,
  );
}
export function recommendationResolve(question, rows) {
  const options = rows.filter((r) => r.Type === "选项"),
    stems = rows.filter((r) => r.Type === "题干");
  return {
    ...question,
    _resolved: true,
    options,
    stems,
    solutions: rows.filter((r) => !["选项", "题干"].includes(r.Type)),
    QuestionType: options.length
      ? options.filter((o) => number(o.IsAnswer) === 1).length > 1
        ? "多选题"
        : "单选题"
      : rows[0]?.Name || question._question_list?.QuestionType || "解答题",
  };
}

export function recommendationPrintUrl(context, group) {
  try {
    const direct = new URL(String(group.Files || ""));
    if (["https:", "http:"].includes(direct.protocol)) return direct.href;
  } catch {}
  const url = new URL(
    "https://web.math-upstream.invalid/External/RecommendPaperPrintSpecial.html",
  );
  for (const [key, value] of Object.entries({
    courseID: context.CourseID,
    calendarID: context.CalendarID,
    PaperID: context.PaperID,
    StuID: context.stuid,
    LinkSort: group.LinkSort,
  }))
    url.searchParams.set(key, String(value ?? 0));
  return url.href;
}
export function teacherRecommendationRows(rows, originQuestionId) {
  return rows.filter(
    (row) => String(row.QuestionID) !== String(originQuestionId),
  );
}
export function teacherRecommendationRecord(
  context,
  question,
  existing,
  correct,
) {
  return {
    ID: existing?.ID || 0,
    StuID: context.stuid,
    CourseID: context.CourseID,
    CalendarID: context.CalendarID,
    BusType: 1,
    BusID: context.PaperID,
    BusValue: existing?.BusValue ?? "",
    AnswerState: Number(correct) === 1 ? 1 : 0,
    BusRelationID: question.QuestionID || question.ID,
    ProductID: Number(context.ProductID) || 0,
    ...(existing?.BookID || question._question_list?.BookID
      ? { BookID: existing?.BookID || question._question_list.BookID }
      : {}),
  };
}
