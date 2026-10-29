export function orderedSubcourses(course) {
  const list = Array.isArray(course?.courses) ? course.courses : [];
  const ids = String(course?.courseRelated || "")
    .split(",")
    .filter(Boolean);
  const ordered = ids.map((id) => list.find((course) => String(course.id) === id)).filter(Boolean);
  return [...ordered, ...list.filter(course => !ordered.includes(course))];
}
export function studyCourseId(course, selected = "") {
  return String(
    selected || orderedSubcourses(course)[0]?.id || course?.id || "",
  );
}
export function courseAttachments(lesson, detail) {
  const array = (value) => (Array.isArray(value) ? value : []);
  const items = [
    ...array(lesson?.attachmentList),
    ...array(lesson?.attachments),
    ...array(detail?.attachmentList),
    ...array(detail?.attachments),
    ...array(detail?.files),
  ];
  const found = new Set();
  return items
    .map((f) => ({
      ...f,
      name: f.attachName || f.fileName || f.name || "课程资料",
      url: f.previewUrl || f.url || f.fileUrl || f.attachUrl,
    }))
    .filter((f) => {
      if (
        typeof f.url !== "string" ||
        !/^https?:\/\//i.test(f.url) ||
        found.has(f.url)
      )
        return false;
      found.add(f.url);
      return true;
    });
}
export function lessonProgress({
  lesson,
  courseId,
  position,
  duration,
  elapsed,
  at = Date.now(),
}) {
  return {
    historyModifyDate: at,
    lessonId: lesson.id,
    watchHistoryTime: Math.max(1, position),
    progress:
      String(lesson.progress) === "100%"
        ? "100%"
        : `${duration > 0 ? Math.min(100, Math.ceil((position / duration) * 100)) : 0}%`,
    courseId: lesson._studyCourseId || courseId,
    time: Math.max(0, Math.round(elapsed)),
  };
}
export function maskCourseReviewer(value) {
  const s = String(value || "学习者");
  return s.length < 2 ? s : s[0] + "***" + s.at(-1);
}
