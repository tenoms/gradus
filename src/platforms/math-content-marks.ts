export function mathContentMarkType(value: string): string | undefined {
  const type = value === "模板资源" ? "小模块" : value;
  return ["视频解析", "骚操作", "考点", "一题多解", "疑难点", "重要结论", "题目详解", "举一反三", "小模块"].includes(type)
    ? type : undefined;
}

export function mathContentLikeDelete(
  stuid: string,
  recordId: string | number,
  fileId: string | number,
) {
  // The live endpoint deletes by content BusID and actor; ID alone reports
  // success while leaving the vote present. QuestionInfo uses this contract.
  return { StuID: stuid, ID: recordId, BusID: fileId };
}
