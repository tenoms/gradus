export function durationSeconds(value) {
  if (typeof value === "number") return Math.max(0, value);
  const parts = String(value || "")
    .split(":")
    .map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}
export function calendarFinished(calendar) {
  if (Number(calendar.State) === 4) return true;
  if (
    !(calendar.c_course_users_progressList || []).some(
      (row) => Number(row.IsFinished) === 1,
    )
  )
    return false;
  const details = calendar.c_course_calendar_detailList || [];
  const entry = details.some((row) => Number(row.BusType) === 3),
    exit = details.some((row) => Number(row.BusType) === 4);
  const required = entry && exit ? 6 : entry ? 4 : exit ? 2 : 0;
  const finished = (calendar.c_course_users_recordList || []).filter(
    (row) => Number(row.BusRelationID) === 0 && Number(row.IsFinished) === 1,
  ).length;
  return finished >= required;
}
export function taskType(task) {
  const type = Number(task.BusType);
  return type === 1
    ? "题目"
    : type === 2
      ? "录播"
      : [3, 4, 5, 6, 9].includes(type)
        ? "测评"
        : type === 8
          ? "作业"
          : "学习资料";
}
export function videoProgressRecord(
  context,
  task,
  seconds,
  duration,
  previous = {},
) {
  const observed = Math.max(
    Number(previous.BusValue || 0),
    Math.floor(Number(seconds) || 0),
  );
  const finished =
    Number(previous.IsFinished) === 1 ||
    (duration > 0 && observed > duration * 0.85);
  return {
    ...(Number(previous.ID) ? { ID: Number(previous.ID) } : {}),
    StuID: context.StuID,
    CourseID: context.CourseID,
    CalendarID: context.CalendarID,
    ProductID: Number(context.ProductID || 0),
    BusType: 2,
    BusID: task.BusID,
    BusValue: observed,
    IsFinished: finished ? 1 : 0,
  };
}

export function leakPaperState(task, outstanding = 0) {
  const student = task._c_paper_student;
  if (!student) return 0;
  if (Number(student.StuState) !== 1) return 1;
  if (Number(student.TeacherState) !== 1) return 2;
  return Number(outstanding) > 0 ? 3 : 4;
}

export function courseMinutes(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0
    ? Number((value / 60).toFixed(1))
    : 0;
}
export function packetAuthorization(rows, productID, auth = []) {
  const protectedProduct = [2633, 2634, 2635].includes(Number(productID)),
    byID = new Map(rows.map((row) => [String(row.ID), row]));
  return rows.map((row) => {
    const path = [row],
      visited = new Set([String(row.ID)]);
    let parent = byID.get(String(row.PID));
    while (parent && !visited.has(String(parent.ID))) {
      path.unshift(parent);
      visited.add(String(parent.ID));
      parent = byID.get(String(parent.PID));
    }
    const chapterID = row._authChapterID ?? path[2]?.ID;
    return {
      ...row,
      _depth: path.length - 1,
      _authChapterID: chapterID,
      hasAuth:
        !protectedProduct ||
        (chapterID === undefined && path.length < 3) ||
        auth.some((item) => String(item.FunctionID) === String(chapterID)),
    };
  });
}
export function completedCourseAssignments(tasks) {
  const result = [];
  let total = 0;
  for (const task of tasks)
    for (const content of task._book_highscorealbum_catalog_content || []) {
      total++;
      const teacher = Number(content.BusValue) === 1,
        student = content._c_paper_student,
        records = Array.isArray(content._c_course_users_record)
          ? content._c_course_users_record
          : content._c_course_users_record
            ? [content._c_course_users_record]
            : [],
        complete = teacher
          ? Number(student?.TeacherState) === 1
          : records.some(
              (row) =>
                Number(row.BusRelationID) === 0 && Number(row.IsFinished) === 1,
            );
      if (!complete) continue;
      const record =
        records.find(
          (row) =>
            Number(row.BusRelationID) === 0 && Number(row.IsFinished) === 1,
        ) || {};
      result.push({
        ...content,
        CourseID: task.CourseID,
        CalendarID: task.CalendarID,
        ProductID: task.ProductID,
        ModuleName: task._book_highscorealbum?.Title || task.Title || task.Name,
        Score: teacher ? student.Score : record.BusValue,
        CompletedAt: teacher
          ? student.UpdateTime || student.EndTime
          : record.AddTime,
        BusType: teacher ? 6 : 3,
      });
    }
  return { rows: result, total };
}
export function courseResumeTarget(input) {
  const rows = (
    Array.isArray(input)
      ? input.flatMap((t) => (Array.isArray(t) ? t : [t]))
      : input
        ? [input]
        : []
  ).filter((row) => row && typeof row === "object");
  const sorted = [...rows].sort(
    (a, b) =>
      Date.parse(String(b.AddTime || "").replace(" ", "T")) -
      Date.parse(String(a.AddTime || "").replace(" ", "T")),
  );
  for (const row of sorted) {
    let query;
    try {
      const route = String(row.Json || "");
      if (route.startsWith("/course/"))
        query = new URL(route, "https://local.invalid").searchParams;
    } catch {}
    const get = (...keys) => keys.map((k) => query?.get(k)).find(Boolean),
      ProductID =
        get("productid", "ProductID") || row.ProductID || row.CourseProductID,
      CourseID = get("courseID", "courseid") || row.CourseID,
      CalendarID = get("calendarID", "calendarid") || row.CalendarID,
      BusID = get("QuestionID", "vid", "PaperID") || row.BusID,
      CoursePacketID = get("coursepacketid") || row.CoursePacketID;
    if (ProductID && (CourseID || CoursePacketID))
      return { ...row, ProductID, CourseID, CalendarID, BusID, CoursePacketID };
  }
}
export function packetResumeEntry(sections, record) {
  for (const section of sections) {
    const entry = (section._c_course_packet || []).find(
      (row) => String(row.ID) === String(record.CourseID2),
    );
    if (entry) return { entry, section };
  }
  return undefined;
}
export function courseAccessError(product, now = Date.now()) {
  const parse = (value) => {
    const text = String(value || "");
    if (!text || text.startsWith("0001-") || text.startsWith("1900-"))
      return NaN;
    return Date.parse(
      /[zZ]|[+-]\d\d:\d\d$/.test(text)
        ? text
        : text.replace(" ", "T") + "+08:00",
    );
  };
  if (parse(product.StateaTime) > now)
    return "课程尚未开始，请按原开放时间进入。";
  if (parse(product.EndTime) < now) return "当前课程的学习期限已结束。";
  return "";
}
export function courseTasksFinished(tasks) {
  if (!tasks.length) return false;
  return tasks.every((task) => {
    const type = Number(task.BusType),
      records = Array.isArray(task._record) ? task._record : [],
      summary = records.some(
        (record) =>
          Number(record.IsFinished) === 1 && Number(record.BusRelationID) === 0,
      );
    if (type === 1) return records.length > 0;
    if (type === 2)
      return records.some((record) => Number(record.IsFinished) === 1);
    if ([3, 4, 5, 9].includes(type)) return records.length > 1 && summary;
    if (type === 6) return Number(task._c_paper_student?.TeacherState) === 1;
    if (type === 8) {
      const content = task._book_highscorealbum_catalog_content || [];
      return (
        content.length > 0 &&
        content.every((item) =>
          item._c_paper_student
            ? Number(item._c_paper_student.TeacherState) === 1
            : (item._c_course_users_record || []).some(
                (record) =>
                  Number(record.IsFinished) === 1 &&
                  Number(record.BusRelationID) === 0,
              ),
        )
      );
    }
    return false;
  });
}
export function packetVisitRecord(
  stuid,
  productID,
  packetID,
  entry,
  now = Date.now(),
) {
  return {
    CourseID: entry.CourseID,
    StuID: stuid,
    BusType: 3,
    BusID: packetID,
    IsFinished: 0,
    ProductID: productID,
    AddTime: new Date(now + 8 * 3600000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " "),
  };
}
export function courseVipActive(user, now = Date.now()) {
  const value = String(user?.VipEndTime || "");
  if (!value) return false;
  return (
    Date.parse(
      /[zZ]|[+-]\d\d:\d\d$/.test(value)
        ? value
        : value.replace(" ", "T") + "+08:00",
    ) > now
  );
}
export function zeroPriceCourse(product) {
  const zero = (value) =>
    (typeof value === "number" ||
      (typeof value === "string" && value.trim() !== "")) &&
    Number(value) === 0;
  return zero(product?.Proce) && zero(product?.DiscountPrice);
}
export function freeCourseClaim(stuid, CourseProductID, now = Date.now()) {
  return {
    CourseProductID,
    StuID: stuid,
    Source: "系统支付开通",
    Room:
      "系统开通" +
      new Date(now + 8 * 3600000).toISOString().slice(0, 7).replace("-", ""),
    System_Station_ID: 1,
  };
}

export function courseQuestionRecord(context, task, answer, previous = {}) {
  return {
    ...context,
    BusType: 1,
    BusID: 0,
    IsFinished: 1,
    Answer: answer,
    BusValue: "",
    BusRelationID: task.Data?.ID || task.BusID,
    BookID: task.Data?.BookID || task.BookID || 0,
    ...(Number(previous.ID) > 0
      ? { ID: previous.ID, UpdateColumns: "ID,Answer" }
      : {}),
  };
}
