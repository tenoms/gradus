export function studyProfilePayload(form, stuid) {
  const keys = [
    "UserName",
    "SchoolName",
    "TargetSchool",
    "IsCrossCourse",
    "TargetScore",
    "IsWorkStudy",
    "CourseName",
    "Province",
    "QQ",
    "ElseQuestion",
    "Score2",
    "UseRestsApp",
    "IsRealizeCourse",
    "IsInActivities",
    "GoOverTime",
  ];
  return {
    StuID: stuid,
    ...Object.fromEntries(keys.map((k) => [k, form[k] ?? ""])),
    isJoinCourse: form.IsJoinCourse ?? form.isJoinCourse ?? "",
    System_Station_ID: 1,
    Source: form.Source || "Web学习空间",
  };
}
