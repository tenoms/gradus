import { catalogResource, platformRequest, studyFetch } from "../lib/api";
import { mergeMathLibraryCatalog } from "./math-library";
import { mathResponseData, mathResponseError } from "./math-response";

export type MathRow = Record<string, any>;
export type NoteKind = "错题" | "收藏" | "笔记";
const station = 1;
const stableCatalogCommands = new Set([
  "GetBookPaperListOfVip", "GetBookListCountAndLookCount_New", "GetQuestionNexts2",
  "GetBookHighscorealbumList", "GetCoursePacketList",
]);
const stableCatalogPaths = new Set([
  "/api/book_highscorealbum_catalog/GetListByPagev2",
  "/api/book_highscorealbum_catalog/GetlistByCacheV2",
  "/api/c_course_list/GetListByPage", "/api/c_course_packet/GetListByPage",
]);

function checked(response: any) {
  const error = mathResponseError(response);
  if (error) throw new Error(error);
  return response;
}
export async function mathCommand(
  command: string,
  params: MathRow = {},
  model = false,
) {
  const load = async () => checked(
    await platformRequest("math", {
      path: model ? "/api/Master/Model" : "/api/Master/AutoModel",
      method: "POST",
      data: {
        command,
        data: JSON.stringify(params),
        ...(params.page !== undefined ? { page: params.page } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
      },
    }),
  );
  return /^Get/.test(command)
    ? catalogResource(JSON.stringify(["math-command", command, model, params]), load, stableCatalogCommands.has(command) ? 60_000 : 0)
    : load();
}
// AutoModel also caches personalized reports by command parameters. Reads that
// follow a write need a new parameter, just as the original GET client does.
export function mathFreshCommand(command: string, params: MathRow = {}) {
  return mathCommand(command, { ...params, t: Date.now() });
}
export async function mathGet(path: string, query: MathRow = {}) {
  return catalogResource(JSON.stringify(["math-get", path, query]),
    async () => checked(await platformRequest("math", { path, method: "GET", query })),
    stableCatalogPaths.has(path) ? 60_000 : 0);
}
export async function mathPost(path: string, data: MathRow = {}) {
  return checked(await platformRequest("math", { path, method: "POST", data }));
}
export const mathData = mathResponseData;
export function mathRows(response: any, table = 0): MathRow[] {
  const data = mathData(response);
  if (Array.isArray(data))
    return Array.isArray(data[0]) ? data[table] || [] : data;
  for (const key of ["rows", "list", "List", "Rows", "Items", "items"])
    if (Array.isArray(data?.[key])) return data[key];
  return data && typeof data === "object" ? [data] : [];
}
export function mathTables(response: any): MathRow[][] {
  const data = mathData(response);
  return Array.isArray(data?.[0]) ? data : [mathRows(response)];
}
export function mathTitle(row: MathRow) {
  return String(
    row.Name ||
      row.BookName ||
      row.Title ||
      row.QuestionName ||
      row.CatalogName ||
      row.ChapterName ||
      `第 ${row.QuestionSort || row.Sort || row.ID || ""} 项`,
  );
}
export function mathQuestionId(row: MathRow) {
  return row.QuestionID ?? row.questionID ?? row.qID ?? row.ID;
}
export function mathImage(value: unknown) {
  return typeof value === "string"
    ? value.replaceAll(".png_yjs", ".png").split(";")[0]
    : "";
}

export const mathApi = {
  rawBooks: () =>
    mathCommand(
      "GetBookPaperListOfVip",
      {
        IsValid: 1,
        System_Station_ID: station,
        IsBook: 1,
        IsBeta: 0,
        IsRecommend: "",
      },
      true,
    ),
  papers: () =>
    mathCommand(
      "GetBookListCountAndLookCount_New",
      {
        IsValid: 1,
        System_Station_ID: station,
        BusType: "试卷",
        IsBook: 1,
        IsBeta: 0,
        IsRecommend: "",
      },
      true,
    ),
  async books() {
    const [response, papers] = await Promise.all([
      mathApi.rawBooks(),
      mathApi.papers(),
    ]);
    const books = mergeMathLibraryCatalog(mathRows(response), mathRows(papers));
    const data = mathData(response);
    return {
      ...response,
      data: Array.isArray(data?.[0]) ? [books, ...data.slice(1)] : books,
    };
  },
  bookCatalog: (BookID: string | number) =>
    mathCommand("GetQuestionNexts2", { BookID }),
  question: (ID: string | number) =>
    mathGet("/api/question_list/GetQuestionByQuestionNew", { ID }),
  analysis: (ID: string | number) =>
    mathGet("/api/question_list/GetQuestionByIDSoleDes", {
      ID,
      System_Station_ID: station,
      SortDesc: "Sort",
    }),
  resolve: (QuestionID: string | number) =>
    mathCommand("GetQuestionInfoByResolve", { QuestionID }),
  files: (QuestionID: string | number) =>
    mathGet("/api/question_files/GetListByAll", { QuestionID }),
  search: (params: MathRow, paper = false) =>
    mathCommand(
      paper ? "GetPaperListBySearchQuestion" : "GetBookListBySearchQuestion",
      params,
    ),
  albums: () =>
    mathCommand(
      "GetBookHighscorealbumList",
      {
        System_Station_ID: station,
        IsValid: 1,
        BusType: "会员专辑",
        SortDesc: "Sort",
      },
      true,
    ),
  albumCatalog: (AlbumID: string | number, PID = -1) =>
    mathGet("/api/book_highscorealbum_catalog/GetListByPagev2", {
      AlbumID,
      PID,
      limit: 1000,
      page: 1,
      SortDesc: "Sort",
      IsValid: 1,
    }),
  albumItems: (ID: string | number) =>
    mathGet("/api/book_highscorealbum_catalog/GetlistByCacheV2", {
      ID,
      IsValid: 1,
    }),
  practiceCatalog: (
    StuID: string,
    BusType: string,
    ExamType: string,
    CataCode = "1",
  ) =>
    mathCommand("GetCataLogListByStuIDAndCode", {
      StuID,
      CataCode,
      BusType,
      ExamType,
      System_Station_ID: station,
    }),
  createPractice: (
    StuID: string,
    BusType: string,
    CatalogID: number,
    ExanType: string,
    Type: string,
  ) =>
    mathPost("/api/choice_question_exercise/RelPaper", {
      StuID,
      BusType,
      CatalogID,
      ExanType,
      Type,
      System_Station_ID: station,
    }),
  practiceQuestions: (ID: string | number, StuID: string) =>
    mathGet("/api/choice_question_exercise/GetPaper", { ID, StuID }),
  saveAnswer: (ID: number, MyAnswer: string, State: number) =>
    mathPost(
      "/api/choice_question_exercise_log/Inner_choice_question_exercise_log",
      { ID, MyAnswer, State, UpdateColumns: "ID,MyAnswer,State" },
    ),
  finishPractice: (ID: number) =>
    mathPost("/api/choice_question_exercise/Inner_choice_question_exercise", {
      ID,
      IsFinish: 1,
      UpdateColumns: "ID,IsFinish",
    }),
  practiceHistory: (
    StuID: string,
    BusType: string,
    ExanType: string,
    Type: string,
  ) =>
    mathCommand("GetCatalogHistoryList", {
      t: Date.now(),
      StuID,
      BusType,
      ExanType,
      Type,
      CatalogCode: 0,
      CodeLength: 1,
      System_Station_ID: station,
    }),
  noteCatalogs: (StuID: string, BusType: NoteKind, BusValue = "数一") =>
    mathCommand("GetSysUserBookCatalog", {
      StuID,
      BusType,
      BusValue,
      Type: "用户笔记本",
      System_Station_ID: station,
    }),
  createNoteCatalog: (StuID: string, BusType: NoteKind, Name: string) =>
    mathPost("/api/sys_user_book_catalog/Inner_sys_user_book_catalog", {
      StuID,
      BusType,
      Name,
      Type: "用户笔记本",
      System_Station_ID: station,
    }),
  notes: (StuID: string, Type: NoteKind) =>
    mathCommand("GetRelQuestionLogMistakesOrFavoriteList", { StuID, Type }),
  questionNotes: (StuID: string, Type: NoteKind, QuestionID: number | string) =>
    mathGet("/api/sys_user_book_question/GetListByPage", {
      StuID,
      Type,
      QuestionID,
      limit: 100,
      page: 1,
    }),
  saveNote: (data: MathRow) =>
    mathPost("/api/sys_user_book_question/Inner_sys_user_book_question", {
      IsCourse: "1",
      System_Station_ID: station,
      Source: "电子书",
      ...data,
    }),
  deleteNote: (ID: number, StuID: string) =>
    mathPost("/api/sys_user_book_question/Dels_sys_user_book_question", {
      ids: String(ID),
      StuID,
    }),
  discussions: (QuestionID: number | string) =>
    mathGet("/api/sys_comment/GetUser", {
      ID: QuestionID,
      limit: 100,
      page: 1,
      SortDesc: "",
    }),
  discussionReplies: (QuestionID: number | string, PID: number | string) =>
    mathCommand("GetDiscussListByPID", { QuestionID, PID }),
  addComment: (data: MathRow) =>
    mathPost("/api/sys_comment/Add", { ...data, System_Station_ID: station }),
  messages: (StuID: string) =>
    mathGet("/api/sys_msg_push/GetListByPagev2", {
      StuID,
      System_Station_ID: station,
      page: 1,
      limit: 100,
      SortDesc: "AddTime desc",
    }),
  readMessage: (ID: number, StuID: string) =>
    mathPost("/api/sys_msg_push/UpdateIsReadState", { ID, StuID, IsRead: 1 }),
  history: (StuID: string) =>
    mathCommand("GetUserCourseQrcodeBookListPager1", {
      StuID,
      Page: 0,
      PageSize: 100,
    }),
  courses: (StuID: string) =>
    mathGet("/api/c_course_packet/GetPacketList", {
      StuID,
      System_Station_ID: station,
    }),
  courseChapters: (ID: number, StuID: string) =>
    mathGet("/api/c_course_packet/GetPacketV2", {
      ID,
      StuID,
      System_Station_ID: station,
    }),
  exams: (StuID: string) =>
    mathCommand("GetDryRunInfoList", { StuID, System_Station_ID: station }),
  async photoSearch(image: File) {
    const form = new FormData();
    form.append("image", image);
    const response = await studyFetch("/api/platform/math/photo", {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data?.error || data?.message || "图片识别失败");
    if (data.errorCode !== "000" || !data.ocr)
      throw new Error(
        data?.errorMessage ||
          data?.message ||
          "没有识别到清晰的题目，请重新拍摄",
      );
    return mathPost("/api/question_search_photo/SearchPhotoKey", {
      SearchKey1: data.feat,
      SearchKey2: data.ocr,
      System_Station_ID: station,
    });
  },
};
