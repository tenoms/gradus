import {
  mathApi,
  mathCommand,
  mathGet,
  mathPost,
  mathRows,
} from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import {
  courseAlbumLog,
  courseAlbumOperation,
  courseAlbumWork,
} from "./course-album-model.mjs";
export interface CourseAlbumContext {
  stuid: string;
  CourseID: string | number;
  CalendarID: string | number;
  ProductID: string | number;
}
const completed = (result: PromiseSettledResult<any>) => result.status === "fulfilled" ? result.value : undefined;
const readError = (result: PromiseSettledResult<any>, label: string) => result.status === "rejected" ? `${label}读取失败：${result.reason instanceof Error ? result.reason.message : String(result.reason)}` : undefined;
export const courseAlbumApi = {
  async load(AlbumID: string | number, context: CourseAlbumContext) {
    const [info, catalogs, progress] = await Promise.allSettled([
      mathCommand("GetAlbumInfo", { AlbumID }),
      mathApi.albumCatalog(AlbumID),
      mathGet("/api/book_highscorealbum_studylog/GetListByPage", {
        AlbumID,
        StuID: context.stuid,
        System_Station_ID: 1,
        ProductID: context.ProductID,
        CourseID: context.CourseID,
        Type: "章节",
        page: 1,
        limit: 1000,
        SortDesc: "AddTime Desc",
      }),
    ]);
    return {
      info: mathRows(completed(info))[0] || {},
      catalogs: mathRows(completed(catalogs)),
      progress: mathRows(completed(progress)),
      errors: {
        info: readError(info, "专辑介绍"),
        catalogs: readError(catalogs, "专辑目录"),
        progress: readError(progress, "阅读进度"),
      },
    };
  },
  async chapter(
    AlbumID: string | number,
    CatalogID: string | number,
    context: CourseAlbumContext,
  ) {
    const [content, log, likes] = await Promise.allSettled([
      mathApi.albumItems(CatalogID),
      mathGet("/api/book_highscorealbum_studylog/GetListByPage", {
        AlbumID,
        CatalogID,
        StuID: context.stuid,
        System_Station_ID: 1,
        ProductID: context.ProductID,
        CourseID: context.CourseID,
        Type: "章节",
        page: 1,
        limit: 1,
        SortDesc: "AddTime Desc",
      }),
      mathCommand("GetHighscorealbumGive", {
        CatalogID,
        AlbumID,
        StuID: context.stuid,
      }),
    ]);
    return {
      rows: mathRows(completed(content)),
      log: mathRows(completed(log))[0] || {},
      likes: mathRows(completed(likes))[0] || {},
      errors: {
        content: readError(content, "章节正文"),
        log: readError(log, "章节阅读记录"),
        likes: readError(likes, "点赞记录"),
      },
    };
  },
  async operations(rows: MathRow[], context: CourseAlbumContext) {
    const work = courseAlbumWork(rows),
      base = {
        ProductID: context.ProductID,
        CourseID: context.CourseID,
        CalendarID: context.CalendarID,
        StuID: context.stuid,
      },
      ordinary = work.filter((row) => !row.isTeacher).map((row) => row.BusID),
      teacher = work.filter((row) => row.isTeacher).map((row) => row.BusID),
      [normal, mark] = await Promise.all([
        ordinary.length
          ? mathCommand("GetAlbumOperationinfo", {
              ...base,
              PaperIDs: ordinary.join(","),
            })
          : Promise.resolve({ data: [[]] }),
        teacher.length
          ? mathCommand("GetAlbumTecherPaperOperationinfo", {
              ...base,
              PaperIDs: teacher.join(","),
            })
          : Promise.resolve({ data: [[]] }),
      ]);
    return courseAlbumOperation(work, mathRows(normal), mathRows(mark));
  },
  save: (
    context: CourseAlbumContext,
    AlbumID: any,
    CatalogID: any,
    BusID: any,
    previous: MathRow,
  ) =>
    mathPost(
      "/api/book_highscorealbum_studylog/Inner_book_highscorealbum_studylog",
      courseAlbumLog(context, AlbumID, CatalogID, BusID, previous),
    ),
  like: (
    context: CourseAlbumContext,
    AlbumID: any,
    CatalogID: any,
    previous: MathRow,
  ) =>
    previous.MyLogID
      ? mathPost(
          "/api/book_highscorealbum_studylog/Del_book_highscorealbum_studylog",
          { ID: previous.MyLogID },
        )
      : mathPost(
          "/api/book_highscorealbum_studylog/Inner_book_highscorealbum_studylog",
          {
            Type: "点赞",
            CatalogID,
            AlbumID,
            StuID: context.stuid,
            System_Station_ID: 1,
          },
        ),
};
