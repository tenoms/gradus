import {
  mathApi,
  mathCommand,
  mathData,
  mathGet,
  mathPost,
  mathRows,
} from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import {
  courseAlbumFeedback,
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
export const courseAlbumApi = {
  async load(AlbumID: string | number, context: CourseAlbumContext) {
    const [info, catalogs, progress] = await Promise.all([
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
      info: mathRows(info)[0] || {},
      catalogs: mathRows(catalogs),
      progress: mathRows(progress),
    };
  },
  async chapter(
    AlbumID: string | number,
    CatalogID: string | number,
    context: CourseAlbumContext,
  ) {
    const [content, log, likes] = await Promise.all([
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
      rows: mathRows(content),
      log: mathRows(log)[0] || {},
      likes: mathRows(likes)[0] || {},
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
  async feedback(
    context: CourseAlbumContext,
    AlbumID: any,
    CatalogID: any,
    types: string[],
    content: string,
    images: string[],
  ) {
    const payload = courseAlbumFeedback(
        context,
        AlbumID,
        CatalogID,
        types,
        content,
        images,
      ),
      config = mathRows(
        await mathGet("/api/wx_xcx_info/GetListByAll", {
          System_Station_ID: 1,
        }),
      )[0];
    if (Number(config?.Parm2) === 1) {
      const scan = await mathGet("/api/base/ScanText2", { txt: content });
      if (scan.Data?.Labels || scan.Data?.Reason)
        throw new Error("内容未通过平台检查，请调整后重试");
    }
    return mathPost("/api/sys_give/Inner_sys_give", payload);
  },
};
