import {
  mathCommand,
  mathData,
  mathGet,
  mathPost,
  mathRows,
} from "../api/math";
import {
  recommendationAppend,
  recommendationCompletion,
  recommendationSavedRecord,
  teacherRecommendationRows,
} from "./course-recommendations-model.mjs";
export interface RecommendationContext {
  stuid: string;
  PaperID: string | number;
  CourseID: string | number;
  CalendarID: string | number;
  ProductID: string | number;
  isSuper?: boolean;
}
export type RecommendationRow = Record<string, any>;
export const recommendationApi = {
  questions: (context: RecommendationContext) =>
    mathGet("/api/c_paper_question/GetListByPaper2", {
      PaperID: context.PaperID,
      StuID: context.stuid,
      CalendarID: context.CalendarID,
      ProductID: context.ProductID,
    }),
  async load(context: RecommendationContext) {
    const [meta, questions] = await Promise.all([
      mathGet("/api/c_paper/GetListByAll", { ID: context.PaperID }),
      this.questions(context),
    ]);
    return { meta: mathRows(meta)[0] || {}, questions: mathRows(questions) };
  },
  async details(context: RecommendationContext, meta: RecommendationRow) {
    if (context.isSuper)
      return {
        info: mathRows(
          await mathCommand("GetSuperSpecialList", {
            PaperID: context.PaperID,
          }),
        ),
        original: [],
      };
    if (!meta.RelatedID) return { info: {}, original: [] };
    const [info, original] = await Promise.all([
      mathPost("/api/c_paper/RelPaperByStuBySpecial2", {
        ID: meta.RelatedID,
        RelatedStuID: context.stuid,
        BusID: context.CalendarID,
        CalendarID: context.CalendarID,
      }),
      this.questions({ ...context, PaperID: meta.RelatedID }),
    ]);
    return { info: mathData(info) || {}, original: mathRows(original) };
  },
  resolve: (QuestionID: string | number) =>
    mathCommand("GetQuestionInfoByResolve", { QuestionID }),
  analysis: (QuestionID: string | number) =>
    mathGet("/api/question_list/GetQuestionByIDSoleDes", {
      ID: QuestionID,
      SortDesc: "Sort",
    }),
  files: (QuestionID: string | number) =>
    mathGet("/api/question_files/GetListByAll", { QuestionID }),
  videos: (SpecialID: string | number) =>
    mathCommand("GetSpecialVideoListBySpecialID", {
      SpecialID,
    }),
  async save(payload: RecommendationRow) {
    const result = await mathPost(
      "/api/c_course_users_record/Inner_c_course_users_record",
      payload,
    );
    return recommendationSavedRecord(payload, mathData(result));
  },
  async complete(context: RecommendationContext) {
    const result = await mathPost(
      "/api/c_course_users_record/Inner_c_course_users_record",
      recommendationCompletion(context),
    );
    return result;
  },
  append: (
    context: RecommendationContext,
    meta: RecommendationRow,
    Links: string | number,
  ) =>
    mathPost(
      context.isSuper
        ? "/api/c_paper/RelPaperByStuIDCJZT"
        : "/api/c_paper/RelPaperByStuID1",
      recommendationAppend(context, meta, Links),
    ),
};

export const teacherRecommendationApi = {
  async load(QuestionID: string | number) {
    const seed = mathRows(
        await mathGet("/api/question_groups/GetListByPage", {
          QuestionID,
          limit: 1000,
          page: 1,
          SortDesc: "Sort",
        }),
      ),
      GroupKey = seed[0]?.GroupKey;
    if (!GroupKey) return { GroupKey: "", questions: [] };
    const response = await mathGet("/api/question_groups/GetListByPage", {
      GroupKey,
      limit: 1000,
      page: 1,
      SortDesc: "Sort",
    });
    return {
      GroupKey,
      questions: teacherRecommendationRows(mathRows(response), QuestionID),
    };
  },
  record: (context: RecommendationContext, QuestionID: string | number) =>
    mathGet("/api/c_course_users_record/GetListByAll", {
      StuID: context.stuid,
      CourseID: context.CourseID,
      CalendarID: context.CalendarID,
      BusType: 1,
      BusID: context.PaperID,
      BusRelationID: QuestionID,
      ProductID: context.ProductID,
    }),
  async save(payload: RecommendationRow) {
    if (Number(payload.ID) > 0)
      throw new Error("这道老师推荐题已有练习反馈，请继续其他题目。");
    return recommendationSavedRecord(
      payload,
      mathData(
        await mathPost(
          "/api/c_course_users_record/Inner_c_course_users_record",
          payload,
        ),
      ),
    );
  },
};
