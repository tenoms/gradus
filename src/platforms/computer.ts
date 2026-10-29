import { platformRequest } from "../lib/api";

export type ComputerRecord = Record<string, any>;
export const computerSubjects = [
  { id: "701769479767592960", name: "数据结构", examCategory: 1 },
  { id: "701769719702753280", name: "组成原理", examCategory: 1 },
  { id: "704332467330486272", name: "操作系统", examCategory: 1 },
  { id: "707889875399086080", name: "计算机网络", examCategory: 1 },
  { id: "708024163360706560", name: "C语言程序设计", examCategory: 1 },
];
export const typeNames: Record<string, string> = {
  1: "单选题",
  2: "多选题",
  3: "填空题",
  4: "简答题",
  5: "判断题",
  7: "完形题",
};
export const examSources = [
  {
    id: "school",
    name: "院校真题",
    path: "/api/exam/wx/practice/examinationList",
  },
  {
    id: "mooc",
    name: "考点测评",
    path: "/api/exam/wx/membership/practicePointExaminationList/",
  },
  {
    id: "self",
    name: "自命题试卷",
    path: "/api/exam/wx/membership/selfExaminationList/",
  },
  {
    id: "online",
    name: "在线测评",
    path: "/api/exam/wx/membership/onlineExaminationList/",
  },
  {
    id: "short",
    name: "408 基础通关",
    path: "/api/exam/wx/practice/majorId/examination/list",
  },
];
export async function computerRequest(
  path: string,
  query: ComputerRecord = {},
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: any,
): Promise<any> {
  let response = await platformRequest("computer", {
    path,
    method,
    query,
    data,
  });
  if (response && response.statusCode && response.data)
    response = response.data;
  if (
    response &&
    typeof response === "object" &&
    "code" in response &&
    ![200, 0, "200", "0", 5001, 5002, 4094, 4114].includes(response.code)
  )
    throw new Error(
      [4061, 4064].includes(Number(response.code))
        ? `平台正在整理这套题目，请稍后再试（${response.code}）`
        : response.code === 4010 &&
            String(response.data).includes("TooManyResultsException")
          ? "练习组读取失败，请返回章节选择练习组后重试。"
          : response.message && response.message !== "SERVICE ERROR"
            ? response.message
            : response.msg && response.msg !== "SERVICE ERROR"
              ? response.msg
              : `学习服务暂时无法完成请求 (${response.code})`,
    );
  let result =
    response && typeof response === "object" && "data" in response
      ? response.data
      : response;
  if (typeof result === "string" && /^[\[{]/.test(result.trim())) {
    try {
      result = JSON.parse(result);
    } catch {
      throw new Error("上游返回了无法解析的内容，请稍后重试。");
    }
  }
  return result;
}
export function records(data: any): ComputerRecord[] {
  if (Array.isArray(data)) return data;
  for (const field of [
    "list",
    "records",
    "rows",
    "content",
    "examinations",
    "examinationList",
    "infoList",
    "majorCustomList",
    "courseList",
    "courses",
    "taskList",
    "actSignList",
  ])
    if (Array.isArray(data?.[field])) return data[field];
  return [];
}
export function label(item: any): string {
  return String(
    item?.name ||
      item?.title ||
      item?.examName ||
      item?.examinationName ||
      item?.courseName ||
      item?.lessonName ||
      item?.taskName ||
      item?.schoolName ||
      item?.actName ||
      item?.majorName ||
      item?.articleTitle ||
      item?.articleName ||
      "未命名内容",
  );
}
export function identity(item: any): string {
  return String(
    item?.id ||
      item?.exerciseId ||
      item?.examId ||
      item?.schoolId ||
      item?.courseId ||
      "",
  );
}
export function descendants(data: ComputerRecord[]): ComputerRecord[] {
  return data.flatMap((item) => [
    item,
    ...descendants(records(item.children || item.childList || [])),
  ]);
}
export function plain(value: any): string {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}
export function extractExercises(data: any): ComputerRecord[] {
  return records(data?.exercises || data?.exerciseList || (data?.exerciseId ? [data] : data)).map((item) => ({
    ...item,
    exerciseTotalScore:
      data?.exerciseMap?.[item.exerciseId]?.exerciseTotalScore ||
      item.exerciseTotalScore,
    questionList:
      data?.exerciseMap?.[item.exerciseId]?.questions || item.questionList,
  }));
}
export async function computerUpload(
  file: File,
  path = "/api/user/v1/attachment/upload/",
) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(
    `/api/platform/computer/upload?path=${encodeURIComponent(path)}`,
    { method: "POST", body: form, credentials: "same-origin" },
  );
  const data = await response.json();
  if (!response.ok || (data.code && ![200, 0, "200", "0"].includes(data.code)))
    throw new Error(data.message || data.error || data.msg || "上传失败");
  return data.data ?? data;
}
export function objectiveAnswer(
  type: number,
  answer: string,
  expected: string,
): boolean {
  if (!answer.trim()) return false;
  if (type === 2)
    return (
      answer.split(",").filter(Boolean).sort().join(",") ===
      String(expected).split(",").filter(Boolean).sort().join(",")
    );
  return answer === String(expected ?? "");
}
export function computerExamConfig(source: string) {
  return (
    (
      {
        school: {
          examType: 1,
          answerSource: 1,
          chapterId: "2",
          deriveMajor: true,
        },
        mooc: {
          examType: 4,
          answerSource: 6,
          chapterId: "3",
          deriveMajor: false,
        },
        self: {
          examType: 7,
          answerSource: 2,
          chapterId: "6",
          deriveMajor: true,
        },
        online: {
          examType: 15,
          answerSource: 2,
          chapterId: "7",
          deriveMajor: true,
        },
        short: {
          examType: 20,
          answerSource: 2,
          chapterId: "20",
          deriveMajor: true,
        },
      } as Record<
        string,
        {
          examType: number;
          answerSource: number;
          chapterId: string;
          deriveMajor: boolean;
        }
      >
    )[source] || {
      examType: 2,
      answerSource: 2,
      chapterId: "",
      deriveMajor: false,
    }
  );
}
export function restoreComputerAnswers(
  data: ComputerRecord,
): Record<string, string> {
  return Object.fromEntries(
    [...records(data.answerList), ...records(data.answers)]
      .filter((a) => a.exerciseId)
      .map((a) => [String(a.exerciseId), String(a.answer || "")]),
  );
}
export function computerSkippedIds(data: ComputerRecord): string[] {
  return Array.isArray(data.skipExerciseIdList)
    ? [...new Set(data.skipExerciseIdList.filter((id: unknown) => typeof id === "string" || typeof id === "number").map(String))]
    : [];
}
export function computerClozeGroups(
  question: ComputerRecord,
): ComputerRecord[][] {
  const groups: ComputerRecord[][] = [];
  for (const option of records(question.questions)) {
    if (
      !groups.length ||
      (Number(option.questionOrder) === 1 && groups[groups.length - 1].length)
    )
      groups.push([]);
    groups[groups.length - 1].push(option);
  }
  return groups;
}
export function buildComputerAnswer({
  question,
  answer = "",
  majorId,
  chapterId = "",
  examType,
  answerSource = examType,
  startedAt,
  endedAt = Date.now(),
  skip = false,
  aiResult,
  deriveMajor = false,
}: {
  question: ComputerRecord;
  answer?: string;
  majorId: string;
  chapterId?: string;
  examType: number;
  answerSource?: number;
  startedAt: number;
  endedAt?: number;
  skip?: boolean;
  aiResult?: ComputerRecord;
  deriveMajor?: boolean;
}) {
  const type = Number(question.exerciseType),
    correct = objectiveAnswer(type, answer, question.exerciseAnswer),
    subjective = [3, 4].includes(type),
    max = Number(
      question.exerciseTotalScore || question.exerciseProperty?.score || 2,
    );
  const aiScore = Number(aiResult?.finalScore || 0),
    ratio = max > 0 ? aiScore / max : 0,
    tagMajor = String(
      question.exerciseProperty?.knowledgeTags?.[0] || "",
    ).split(",")[0];
  return {
    exerciseId: String(question.exerciseId || question.id),
    type,
    majorId: question.majorId || (deriveMajor && tagMajor ? tagMajor : majorId),
    chapterId: chapterId || question.chapterId || "",
    answer: skip || aiResult ? "" : answer,
    score: skip
      ? max
      : (aiResult?.finalScore ?? (subjective ? 0 : correct ? max : 0)),
    answerType: skip
      ? 1
      : (aiResult?.answerType ??
        (subjective ? (answer ? 3 : 2) : correct && answer ? 1 : 2)),
    markStatus: aiResult ? 4 : 1,
    llmAnswer: aiResult ? JSON.stringify(aiResult.llmAnswer || []) : "",
    answerLevel: aiResult
      ? (aiResult.answerLevel ?? (ratio >= 0.8 ? 1 : ratio >= 0.6 ? 2 : 3))
      : undefined,
    startTime: startedAt,
    endTime: endedAt,
    answerSource: skip ? 15 : answerSource,
  };
}
export function buildComputerSubmission({
  answers,
  examinationId,
  examType,
  startedAt,
  endedAt = Date.now(),
  complete = false,
  skip = false,
  examCategory = 1,
}: {
  answers: ComputerRecord[];
  examinationId: string;
  examType: number;
  startedAt: number;
  endedAt?: number;
  complete?: boolean;
  skip?: boolean;
  examCategory?: number;
}) {
  const elapsed = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  return {
    answers,
    examinationId,
    examType,
    submitStatus: complete ? 1 : 2,
    startTime: startedAt,
    endTime: endedAt,
    examCategory,
    ...(skip ? { skipFlag: true, skip: true } : {}),
    ...(complete
      ? {
          correctNumber: answers.filter((a) => a.answerType === 1).length,
          inCorrectNumber: answers.filter((a) => a.answerType === 2).length,
          score: answers.reduce((sum, a) => sum + (Number(a.score) || 0), 0),
          time: `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`,
        }
      : {}),
  };
}
export function safeLink(value: any): string | undefined {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function exerciseSource(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const source = value as ComputerRecord;
  return [
    ...new Set(
      [
        source.fromSchool,
        source.examTime,
        source.examFullName,
        source.materialName,
        source.section,
        source.pageNumber ? `第 ${source.pageNumber} 页` : null,
      ]
        .filter((v) => typeof v === "string" || typeof v === "number")
        .map(String),
    ),
  ].join(" · ");
}
