import {
  computerRequest,
  computerSubjects,
  extractExercises,
  objectiveAnswer,
  records,
} from "../../platforms/computer";
import type { ComputerRecord as R } from "../../platforms/computer";

export interface ComputerExerciseLaunch {
  data: R;
  title: string;
  majorId: string;
  chapterId?: string;
  examGroupId?: string;
  examType: number;
  examCategory?: number;
  examExerciseType?: number;
  sectionId?: string;
  random?: boolean;
  source?: string;
  answerSource?: number;
  deriveMajor?: boolean;
  recordId?: string;
  readOnly?: boolean;
  voice?: boolean;
  redo?: { kind: "mistakes" | "collection"; dateFlag: string; sort: string };
}
export function computerFeedbackSource(launch: ComputerExerciseLaunch) {
  if(launch.voice)return 'TEACHER_RECRUITMENT';
  const sources:Record<string,string>={school:'COLLEGE_EXAM',mooc:'ENHANCE_PASS',self:'BASE_PASS',online:'MODAL_EXAM',hot:'MISTAKE_REPORT',photo:'PHOTO_SEARCH',scan:'SCAN_CODE'};
  if(launch.source&&sources[launch.source])return sources[launch.source];
  const stages:Record<number,string>={20:'CENTER_TEST',21:'PREPARE_TEST',22:'COLLEGE_MODAL_EXAM'};
  return stages[launch.examType]||(launch.random?'HOLE_PASS':launch.readOnly?'ANSWER_PARSE':'KNOWLEDGE_TAG');
}
export const computerSubjectGroups = [
  { name: "计算机考研", children: computerSubjects },
  {
    name: "期末不挂科",
    children: [
      ...computerSubjects.map((s) => ({
        ...s,
        name: `期末考${s.name}`,
        examCategory: 2,
      })),
      { id: "707995511914893312", name: "期末考软件工程", examCategory: 2 },
      { id: "709171523524628480", name: "期末考数据库", examCategory: 2 },
      { id: "804349070033424384", name: "期末考Java", examCategory: 2 },
    ],
  },
];
export const computerInterviewSubject = {
  id: "1319622169344614400",
  name: "复试问答",
  examCategory: 1,
};
export const computerHistoryTypes = [
  { id: 3, name: "考研练习卷" },
  { id: 20, name: "408基础通关题" },
  { id: 1, name: "院校真题" },
  { id: 7, name: "基础过关" },
  { id: 4, name: "强化通关" },
  { id: 15, name: "芝士模考" },
  { id: 2, name: "考研测评卷" },
  { id: 10, name: "期末练习卷" },
  { id: 9, name: "期末测评卷" },
  { id: 21, name: "预备测评" },
  { id: 22, name: "定校模考" },
  { id: 18, name: "复试综合问答" },
  { id: 19, name: "复试专业问答" },
];
export function computerVoiceAnswer(url: string, seconds: number) {
  return `${url}$-$${Math.max(1, Math.round(seconds * 1000))}`;
}
export function computerSubjectKey(s: R) {
  return `${s.id || s.majorId}:${s.examCategory || 1}`;
}
export function normalizeComputerSubjects(data: any): R[] {
  return records(data).map((s) => ({
    ...s,
    id: String(s.majorId || s.id),
    name: s.majorName || s.name,
    examCategory: Number(s.examCategory || 1),
  }));
}
export function computerPracticeType(category: number, assessment = false) {
  return category === 2 ? (assessment ? 9 : 10) : assessment ? 2 : 3;
}
export function computerReviewData(data: any) {
  const list = records(data);
  return {
    ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}),
    exercises: list,
    exerciseTotalNumber: Number(data?.total || list.length),
  };
}
export function buildComputerRedo(
  question: R,
  answer: string,
  answerSource: number,
  examCategory: number,
  startedAt: number,
  endedAt = Date.now(),
) {
  const type = Number(question.exerciseType),
    correct = objectiveAnswer(type, answer, question.exerciseAnswer);
  return {
    exerciseId: question.exerciseId || question.id,
    type,
    majorId: question.majorId,
    chapterId: question.chapterId,
    score: correct ? 2 : 0,
    answer,
    answerType: type === 3 ? 3 : correct ? 1 : 2,
    markStatus: 1,
    startTime: startedAt,
    endTime: endedAt,
    answerSource,
    examCategory,
  };
}
export function normalizeComputerReport(data: R) {
  const exam = data.examRecord || data,
    returnedAnswers = records(data.answerList || data.answers),
    answers = returnedAnswers.filter((answer) => answer && typeof answer === "object" && answer.exerciseId),
    exerciseMap = data.exerciseMap || {};
  const merged: R[] = answers.map((a) => ({
    ...a,
    answerType: Number(a.answerType),
    markStatus: Number(a.markStatus),
    exercise: a.exercise ||
      exerciseMap[a.exerciseId] || { exerciseId: a.exerciseId },
  }));
  const pending =
    merged.some((a) => [3, 4].includes(Number(a.markStatus))) &&
    Number(exam.aiScoreStatus) === 0;
  return {
    exam,
    answers: merged,
    examination: data.examination || {},
    pending,
    correct: merged.filter((a) => Number(a.answerType) === 1).length,
    incorrect: merged.filter((a) => Number(a.answerType) === 2).length,
    selfCheck: merged.filter((a) => Number(a.answerType) === 3).length,
    unanswered: returnedAnswers.length - answers.length + merged.filter(
      (a) => !a.answer && !a.llmAnswer && Number(a.answerType) !== 1,
    ).length,
    score: pending
      ? null
      : merged.reduce((sum, a) => sum + (Number(a.score) || 0), 0),
  };
}
export function reportLaunch(
  data: R,
  majorId: string,
  incorrectOnly = false,
): ComputerExerciseLaunch {
  const report = normalizeComputerReport(data),
    answers = report.answers.filter(
      (a) => !incorrectOnly || Number(a.answerType) === 2,
    );
  return {
    data: {
      exercises: answers.map((a) => a.exercise),
      answers,
      answerList: answers,
      examId: report.exam.examinationId || report.examination.id,
    },
    title: incorrectOnly ? "错题解析" : "全部解析",
    majorId,
    examType: Number(report.exam.examType || 3),
    examCategory: Number(report.exam.examCategory || 1),
    recordId: report.exam.id,
    voice: [18, 19].includes(Number(report.exam.examType)),
    readOnly: true,
  };
}
export const computerLearningApi = {
  subjects: () => computerRequest("/api/exam/wx/personal/majorCustomList"),
  updateSubject: (subject: R, remove = false) =>
    computerRequest(
      remove
        ? "/api/exam/wx/personal/deleteMajor"
        : "/api/exam/wx/personal/addMajorCustom",
      {},
      "POST",
      {
        majorId: subject.id || subject.majorId,
        majorName: subject.name || subject.majorName,
        examCategory: Number(subject.examCategory || 1),
      },
    ),
  reviewPage: (kind: "mistakes" | "collection", query: R) =>
    computerRequest(
      kind === "mistakes"
        ? "/api/exam/wx/personal/incorrectExerciseList"
        : "/api/exam/wx/personal/collectExerciseList",
      query,
    ),
  redo: (payload: R) =>
    computerRequest("/api/exam/wx/personal/exerciseRedo", {}, "POST", payload),
  async markMistake(question: R, majorId: string, chapterId: string, examCategory: number, remove = false) {
    const result = await computerRequest("/api/exam/wx/personal/incorrectExercise", {
      incorrectExerciseId: question.exerciseId || question.id,
      majorId: question.majorId || majorId,
      chapterId: question.chapterId || chapterId,
      examCategory,
      flag: remove ? 2 : 1,
    });
    if (result === false) throw new Error(remove ? "平台未完成错题移除，请刷新记录后核对。" : "平台未确认加入错题本，请刷新记录后核对。");
    return result;
  },
  saveSheetIndex: (examRecordId: string, sheetIndex: number) =>
    computerRequest("/api/exam/wx/practice/submit/sheet/index", {}, "POST", {examRecordId,sheetIndex}),
  dates: (majorId: string, examCategory: number, itemFlag: number) =>
    computerRequest("/api/exam/wx/personal/countDiffDateExercise", {
      majorId,
      examCategory,
      itemFlag,
    }),
  chapterCounts: (majorId: string, examCategory: number, dateFlag: string) =>
    computerRequest("/api/exam/wx/personal/countDiffChapterExercise", {
      majorId,
      examCategory,
      dateFlag,
    }),
  feedback: (data: R) =>
    computerRequest(
      "/api/exam/wx/practice/addExerciseErrata/",
      {},
      "POST",
      data,
    ),
  specialList: (kind: string, majorId: string) =>
    kind === "short"
      ? computerRequest("/api/exam/wx/practice/majorId/examination/list", {
          majorId,
          examExerciseType: 4,
          examType: 3,
        })
      : computerRequest("/api/exam/wx/practice/examination/search", {
          examType: kind === "interview-general" ? 18 : 19,
        }),
  hotQuestions: () =>
    computerRequest("/api/exam/wx/personal/OtherExamExercise", { examType: 6 }),
  stages: (examType: number) =>
    computerRequest("/api/exam/wx/practice/basic/progress/stat", { examType }),
  groups: (chapterId: string) =>
    computerRequest("/api/exam/wx/practice/examination/group/list", {
      chapterId,
      examExerciseType: 1,
    }),
  warmGroup: (groupId: string) =>
    computerRequest(
      "/api/exam/wx/practice/cache/examination/group",
      { groupId },
      "POST",
    ),
  async groupExercise(subject: R, chapterId: string, examGroupId: string) {
    await computerLearningApi.warmGroup(examGroupId);
    return computerRequest("/api/exam/wx/practice/exerciseList", {
      majorId: String(subject.id),
      chapterId,
      examGroupId,
      examExerciseType: 1,
      examType: computerPracticeType(Number(subject.examCategory || 1)),
      examCategory: Number(subject.examCategory || 1),
      number: 1,
    });
  },
  async resetRecords(examRecordIdList: string[]) {
    if (!examRecordIdList.length) throw new Error("请选择已有学习记录的练习组");
    const stat = await computerRequest("/api/exam/wx/personal/exercise/stat");
    let identifier = stat.identifier;
    if (!identifier) {
      const detail = await computerLearningApi.report(examRecordIdList[0]);
      identifier = detail.examRecord?.identifier || detail.identifier;
    }
    if (!identifier) throw new Error("平台未返回本人学习记录标识，请刷新记录后再重置。");
    return computerRequest(
      "/api/exam/wx/practice/examination/exercise/reset",
      {},
      "POST",
      { examRecordIdList, identifier },
    );
  },
  report: (examRecordId: string) =>
    computerRequest("/api/exam/wx/practice/examinationRecord/detail", {
      examRecordId,
    }),
  async submittedReport({ recordId, examinationId, majorId, examType, examCategory = 1 }: {
    recordId?: string; examinationId: string; majorId: string; examType: number; examCategory?: number;
  }) {
    let id = recordId;
    if (!id) {
      const history = await computerRequest("/api/exam/wx/practice/examinationRecord", {
        majorId, examType, examCategory, pageNum: 1, pageSize: 100, t: Date.now(),
      });
      const ownRecord = records(history).find(item => String(item.examinationId) === String(examinationId));
      id = ownRecord?.id || ownRecord?.examRecordId;
    }
    if (!id) throw new Error("平台尚未返回本次提交的报告，请稍后重试读取。");
    return computerLearningApi.report(String(id));
  },
  retryScore: (examRecordId: string) =>
    computerRequest("/api/exam/wx/practice/ai/retry/score", {}, "POST", {
      examRecordId,
    }),
  async historyReport(item: R, category: number) {
    try {
      return await computerLearningApi.report(
        String(item.id || item.examRecordId),
      );
    } catch (detailError) {
      const answers = await computerRequest(
        "/api/exam/wx/practice/exerciseRecord",
        { examRecordId: item.id || item.examRecordId, examCategory: category },
      );
      const rows = records(answers);
      if (!rows.length) throw detailError;
      return { examRecord: item, answerList: rows };
    }
  },
  async related(
    question: R,
    majorId: string,
    chapterId: string,
    examCategory = 1,
  ) {
    const tag = String(
      question.exerciseProperty?.knowledgeTags?.[0] || "",
    ).split(",");
    const chapter = question.chapterId || chapterId || tag[1] || "";
    if (
      !chapter ||
      [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "18",
        "19",
        "20",
        "21",
        "22",
      ].includes(String(chapter))
    )
      throw new Error("当前题目没有可用的章节信息，可返回题库选择知识点练习。");
    const data = await computerRequest("/api/exam/wx/practice/exerciseList", {
      majorId: question.majorId || tag[0] || majorId,
      chapterId: chapter,
      examType: computerPracticeType(examCategory, true),
      examCategory,
      number: "",
    });
    return {
      ...data,
      exercises: extractExercises(data).filter(
        (q) => String(q.exerciseId) !== String(question.exerciseId),
      ),
      answerList: [],
      answers: [],
      exerciseTotalNumber: undefined,
    };
  },
};
