import { mathCommand, mathGet, mathPost } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
export const courseApi = {
  catalog: (StuID: string, BusType = "") =>
    mathGet("/api/c_course_product/GetProductByStuID2", {
      StuID,
      System_Station_ID: 1,
      BusType,
      SortDesc: "Sort",
      IsRecommend: 1,
    }),
  vipCatalog: (BusType = "", ProductName = "") =>
    mathCommand("GetCourseProductRecordCounts", {
      System_Station_ID: 1,
      BusType,
      Type: "VIP精品课程",
      ProductName,
    }),
  products: (StuID: string) =>
    mathGet("/api/c_course_product/GetProductByStuID", {
      StuID,
      System_Station_ID: 1,
      Type: "培训课程",
      SortDesc: "Sort",
    }),
  free: (StuID: string) =>
    mathCommand("GetUserByProductCourseWare2", {
      StuID,
      System_Station_ID: 1,
      Type: "免费产品",
    }),
  handouts: (StuID: string) =>
    mathCommand("GetUserByProductCourseWare2", { StuID, System_Station_ID: 1 }),
  courseInfo: (ID: number | string) =>
    mathGet("/api/c_course_list/GetListByPage", { ID, page: 1, limit: 1 }),
  product: (StuID: string, CourseProductID: number | string) =>
    mathGet("/api/c_course_product/GetProductByStuIDAndProductID", {
      StuID,
      CourseProductID,
    }),
  packet: (ID: number | string) =>
    mathGet("/api/c_course_packet/GetListByPage", { ID, page: 1, limit: 1 }),
  packetTree: (CoursePacketID: number | string, ProductID: number | string) =>
    mathCommand("GetCoursePacketList", { CoursePacketID, ProductID }),
  packetChapter: (
    StuID: string,
    ProductID: number | string,
    CourseID: number | string,
    ChapterID: number | string,
  ) =>
    mathGet("/api/c_course_packet/GetPacketV2", {
      StuID,
      ProductID,
      CourseID,
      ChapterID,
      IsValid: 1,
    }),
  chapters: (
    StuID: string,
    courseID: number | string,
    CourseProductID: number | string,
  ) =>
    mathGet("/api/c_course_list/GetCourseListAll", {
      StuID,
      courseID,
      CourseProductID,
    }),
  tasks: (StuID: string, ID: number | string, ProductID: number | string) =>
    mathGet("/api/c_course_list/GetCalendarDetailListV2", {
      StuID,
      ID,
      ProductID,
      SortDesc: "Sort",
    }),
  progress: (data: MathRow) =>
    mathPost(
      "/api/c_course_users_progress/Inner_c_course_users_progress",
      data,
    ),
  visit: (data: MathRow) =>
    mathPost("/api/c_course_product_log/Inner_c_course_product_log2", data),
  records: (data: MathRow) =>
    mathGet("/api/c_course_users_record/GetListByAll", data),
  saveRecord: (data: MathRow) =>
    mathPost("/api/c_course_users_record/Inner_c_course_users_record", data),
  assignments: (
    StuID: string,
    CourseID: number | string,
    ProductID: number | string,
  ) =>
    mathGet("/api/c_course_packet/GetPacketList", {
      StuID,
      CourseID,
      ProductID,
    }),
  exams: (
    StuID: string,
    CourseID: number | string,
    ProductID: number | string,
  ) =>
    mathGet("/api/c_course_packet/GetPacketByPaperList", {
      StuID,
      CourseID,
      ProductID,
    }),
  leakCalendar: (data: MathRow) => mathCommand("GetLeadFillCalendarInfo", data),
  leakStats: (data: MathRow, index: number) =>
    mathCommand(`GetLeakFillingStatistics${index}`, data),
  leakModules: (data: MathRow) => mathCommand("GetLeadFillingModelList", data),
  leakRecommendations: (data: MathRow) =>
    mathGet("/api/c_paper_student_recommend/GetListByAll", {
      ...data,
      SortDesc: "Sort desc",
    }),
  addLeakModules: (Content: MathRow[], existing = false) =>
    mathPost(
      existing
        ? "/api/c_paper_student_recommend/InnerAll_c_paper_student_recommend"
        : "/api/c_paper_student_recommend/InnerAll_c_paper_student_recommend2",
      { Content: JSON.stringify(Content) },
    ),
  last: (
    StuID: string,
    ProductID: number | string,
    CoursePacketID?: number | string,
    ChapterID?: number | string,
  ) =>
    mathCommand("GetProductLastTimeLog", {
      StuID,
      ProductID,
      ...(CoursePacketID !== undefined ? { CoursePacketID } : {}),
      ...(ChapterID !== undefined ? { ChapterID } : {}),
    }),
  packetLast: (
    StuID: string,
    ProductID: number | string,
    CoursePacketID: number | string,
  ) =>
    mathCommand("GetCoursePacketLastStudy", {
      StuID,
      ProductID,
      CoursePacketID,
    }),
  userLast: (StuID: string) => mathCommand("GetUserLastStudyCourse", { StuID }),
  history: (StuID: string, CourseID: number | string, BusType: number) =>
    mathCommand("GetCourseThrillerPaperList", {
      StuID,
      CourseID,
      BusType,
      System_Station_ID: 1,
    }),
  ability: (StuID: string) => mathCommand("GetPaperRecordCounts", { StuID }),
};
export function courseLabel(item: MathRow) {
  return String(
    item.ProductName ||
      item.Title ||
      item.Name ||
      item.Context ||
      item.Data?.Name ||
      item.Data?.Context ||
      item._Paper?.Name ||
      "课程学习",
  );
}
export function courseLinks(item: MathRow): { name: string; url: string }[] {
  const values = [
    item.Files,
    item.FileUrl,
    item.FilesUrl,
    item.BusUrl,
    item.Url,
    item.Data?.Files,
    item.Data?.Url,
    item._Paper?.Files,
  ];
  const result: { name: string; url: string }[] = [];
  for (const v of values)
    for (const raw of String(v || "").split(/[;\n]/)) {
      try {
        const url = new URL(raw.trim());
        if (
          ["https:", "http:"].includes(url.protocol) &&
          !result.some((r) => r.url === url.href)
        )
          result.push({
            name: decodeURIComponent(
              url.pathname.split("/").pop() || "打开课件",
            ),
            url: url.href,
          });
      } catch {}
    }
  return result;
}
export function courseImages(value: any): string[] {
  return String(value || "")
    .replaceAll(".png_yjs", ".png")
    .split(";")
    .map((url) => url.trim())
    .filter((url) => /^https?:\/\//i.test(url));
}
