import { useMathLearningPlan } from "../preparation/MathLearningPlan";
import { weeklySubjectCode, weeklyStageCode } from "../preparation/learning-plan-model.mjs";
import { useSession } from "../../../shared/auth/session";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  LoaderCircle,
  RefreshCw,
  Trophy,
  X,
} from "lucide-react";
import MathQuestionTools from "../questions/MathQuestionTools";
import MathTeacherRecommendations from "../courses/MathTeacherRecommendations";
import MathExamReport, { MathReportDownloads } from "./MathExamReport";
import { uploadMathAttachment } from "../community/MathQuestions";
import RichContent from "../../../shared/content/RichContent";
import MathAnalysisContent from "../questions/MathAnalysisContent";
import { answerProgress } from "../../learning/workbench/answer-progress.mjs";
import "../../learning/workbench/answer-progress.css";
import MathQuestionStem from "../questions/MathQuestionStem";
import { mathOptionFeedback, mathQuestionPrompt } from "../questions/math-question-presentation.mjs";
import "../questions/math-choice-feedback.css";
import { mathCommand, mathData, mathGet, mathPost } from "../api/math";
import { recordActivity } from "../../learning/state/store";
import {
  buildMathExamRecord,
  correctOptionIds,
  durationText,
  examName,
  existingRecord,
  mathExamApi,
  optionRows,
  optionCorrect,
  parseExamJson,
  questionKey,
  questionMax,
  questionText,
  recordAnswer,
  recordScore,
  serverDate,
  table,
} from "./math-exams";
import type { ExamRow as R, MathPaperContext } from "./math-exams";
import "./math-exams.css";

function AsyncStatus({
  loading,
  error,
  empty,
  reload,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  reload?: () => void;
}) {
  if (loading)
    return (
      <div className="math-exam-status" role="status">
        <LoaderCircle size={21} className="spin" />
        正在读取测评内容…
      </div>
    );
  if (error)
    return (
      <div className="math-exam-error" role="alert">
        <span>{error}</span>
        {reload && (
          <button className="btn btn-secondary" onClick={reload}>
            <RefreshCw size={15} />
            重试
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="empty-state">
        <FileText size={30} />
        <h3>暂时没有可用测评</h3>
        <p>可以切换学科或查看其他测评类型。</p>
      </div>
    );
  return null;
}
function useAsync(loader: () => Promise<any>, key: string) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setLoading(true);
    setError("");
    loader()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, version]);
  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
}
function Info({ row }: { row: R }) {
  const labels: R = {
    Name: "名称",
    Score: "得分",
    TotalScore: "总分",
    TotalTime: "用时（秒）",
    rank: "排名",
    rank1: "排名",
    SchoolName: "报考院校",
    MajorName: "报考专业",
    ExamStartTime: "开考时间",
    ExamEndTime: "结束时间",
    AppleStartTime: "报名开始",
    AppleEndTime: "报名截止",
    QuestionNum: "题目数",
    Num: "题目数",
    ExamCount: "学习状态",
    Standby: "本科学校",
    Standby1: "报考年份",
    Total: "总数",
    QuestionScore: "题目得分",
    TeacherContent: "阅卷评语",
    StuContent: "我的作答",
    Teacher: "阅卷方式",
    BusValue: "得分",
    Times: "时长（秒）",
    TotalScores: "总分",
    TotalCounts: "作答数",
  };
  return (
    <dl className="math-exam-info">
      {Object.entries(row)
        .filter(
          ([key, value]) =>
            labels[key] &&
            value != null &&
            value !== "" &&
            typeof value !== "object",
        )
        .map(([key, value]) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
    </dl>
  );
}
function safeUrl(value: any) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function PaperRunner({
  context,
  onClose,
}: {
  context: MathPaperContext;
  onClose: () => void;
}) {
  const { session } = useSession();
  const [followup, setFollowup] = useState<MathPaperContext | null>(null),
    [teacherRecommendations, setTeacherRecommendations] = useState(false);
  const loaded = useAsync(
      () => mathExamApi.loadPaper(context),
      JSON.stringify(context),
    ),
    [meta, setMeta] = useState<R>({}),
    [questions, setQuestions] = useState<R[]>([]),
    [paperlog, setPaperlog] = useState<R>({}),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [scores, setScores] = useState<Record<string, string>>({}),
    [current, setCurrent] = useState(0),
    [started, setStarted] = useState(false),
    [finished, setFinished] = useState(false),
    [sheet, setSheet] = useState(false),
    [reveal, setReveal] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [elapsed, setElapsed] = useState(0),
    [draftReady, setDraftReady] = useState(false);
  const startAt = useRef(Date.now()),
    questionAt = useRef(Date.now()),
    recorded = useRef(false),
    draftKey = `study:math:exam:${session.user?.id || "guest"}:${context.stuid}:${context.kind}:${context.DryID || 0}:${context.PaperID}:${context.CalendarID || 0}`;
  const teacherMark = loaded.data?.teacherMark || false,
    room = loaded.data?.room || {},
    question = questions[current] || {},
    id = questionKey(question),
    options = optionRows(question),
    answer = answers[id] || "",
    max = questionMax(question),
    old = existingRecord(context, question),
    saved = !!old.ID,
    totalScore = questions.reduce(
      (sum, q) =>
        sum + Number(recordScore(context, existingRecord(context, q)) || 0),
      0,
    ),
    maxTotal = questions.reduce((sum, q) => sum + questionMax(q), 0);
  const progressFor = (q: R) => {
    const record = existingRecord(context, q),
      savedAnswer = recordAnswer(context, record),
      currentAnswer = answers[questionKey(q)] || "";
    return answerProgress({
      saved: !!record.ID && currentAnswer === savedAnswer,
      draft: !!currentAnswer || scores[questionKey(q)] !== undefined,
      correct: correctOptionIds(q).length && savedAnswer ? optionCorrect(q, savedAnswer) : undefined,
      revealed: finished,
    });
  };
  const currentProgress = progressFor(question);
  useEffect(() => {
    if (!loaded.data) return;
    const d = loaded.data,
      q = ([...d.questions] as R[]).sort(
        (a, b) =>
          Number(a.Sort || a.QuestionSort || 0) -
          Number(b.Sort || b.QuestionSort || 0),
      ),
      a: Record<string, string> = {},
      s: Record<string, string> = {};
    for (const row of q) {
      const r = existingRecord(context, row);
      a[questionKey(row)] = recordAnswer(context, r);
      const score = recordScore(context, r);
      if (r.ID && score !== "" && score != null)
        s[questionKey(row)] = String(score);
    }
    setMeta(d.meta);
    setQuestions(q);
    setPaperlog(d.paperlog);
    setFinished(Number(d.paperlog.IsSubmit || d.meta.IsSubmit) === 1);
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (draft && Number(d.paperlog.IsSubmit || d.meta.IsSubmit) !== 1) {
        Object.assign(a, draft.answers || {});
        Object.assign(s, draft.scores || {});
        setCurrent(
          Math.max(0, Math.min(Number(draft.current) || 0, q.length - 1)),
        );
        if (draft.startAt) {
          startAt.current = draft.startAt;
          setStarted(true);
        }
      }
    } catch {}
    setAnswers(a);
    setScores(s);
    const upstreamStart = serverDate(
      context.kind === "dry" ? d.paperlog.AddTime : d.meta.StartTime,
    );
    if (Number.isFinite(upstreamStart)) {
      startAt.current = upstreamStart;
      setElapsed(Math.max(0, Math.floor((Date.now() - upstreamStart) / 1000)));
      setStarted(true);
    }
    setDraftReady(true);
  }, [loaded.data]);
  useEffect(() => {
    if (draftReady && !finished)
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          answers,
          scores,
          current,
          startAt: started ? startAt.current : undefined,
        }),
      );
  }, [answers, scores, current, started, finished, draftReady, draftKey]);
  useEffect(() => {
    if (!started || finished) return;
    const tick = () =>
      setElapsed(
        Math.max(0, Math.floor((Date.now() - startAt.current) / 1000)),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [started, finished]);
  useEffect(() => {
    if (!questions[current] || options.length || question._resolved) return;
    let active = true;
    mathExamApi
      .resolve(question.QuestionID || question.ID)
      .then((response) => {
        if (!active) return;
        const content = table(response),
          newOptions = content.filter((r) => r.Type === "选项"),
          stems = content.filter((r) => r.Type === "题干");
        setQuestions((rows) =>
          rows.map((q, i) =>
            i === current
              ? {
                  ...q,
                  _resolved: true,
                  Option: newOptions.length ? newOptions : q.Option,
                  QuestionStem: stems,
                  _analysis: content.filter(
                    (r) => !["题干", "选项"].includes(r.Type),
                  ),
                }
              : q,
          ),
        );
      })
      .catch((e) => {
        if (active) setError(`题目详情读取失败：${e.message}`);
      });
    return () => {
      active = false;
    };
  }, [current, questions.length, question._resolved]);
  async function begin() {
    setLoading(true);
    setError("");
    try {
      const result = await mathExamApi.startPaper(context, meta, paperlog);
      if (context.kind === "dry" && !paperlog.ID) {
        const newId = mathData(result);
        if (typeof newId === "number" || typeof newId === "string")
          setPaperlog((p) => ({ ...p, ID: newId }));
      }
      startAt.current = Date.now();
      questionAt.current = Date.now();
      setStarted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  function move(index: number) {
    if (index < 0 || index >= questions.length) return;
    setCurrent(index);
    setReveal(false);
    setSheet(false);
    questionAt.current = Date.now();
    setError("");
    setNotice("");
  }
  async function save() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (
        !options.length &&
        !teacherMark &&
        (scores[id] == null || scores[id] === "")
      )
        throw new Error("请先对照解析填写本题得分。");
      if (options.length && !answer) throw new Error("请选择答案。");
      if (teacherMark && !answer.trim()) throw new Error("请填写或上传作答。");
      if (
        !teacherMark &&
        !options.length &&
        (!Number.isFinite(Number(scores[id])) ||
          Number(scores[id]) < 0 ||
          Number(scores[id]) > max)
      )
        throw new Error(`本题得分应在 0 到 ${max} 分之间。`);
      const payload = buildMathExamRecord(
          context,
          question,
          answer,
          Number(scores[id]),
          (Date.now() - questionAt.current) / 1000,
          teacherMark,
        ),
        result = await mathExamApi.saveRecord(context, payload),
        newId = old.ID || mathData(result);
      if (typeof newId === "number" || typeof newId === "string")
        payload.ID = newId;
      setQuestions((rows) =>
        rows.map((q, i) =>
          i === current
            ? {
                ...q,
                ...(context.kind === "dry"
                  ? { _log: payload }
                  : context.kind === "course"
                    ? context.isTeacher
                      ? { _c_paper_student_record: payload }
                      : { _c_course_users_record: payload }
                    : { ks_user_record: payload }),
              }
            : q,
        ),
      );
      setScores((s) => ({
        ...s,
        [id]: String(
          context.kind === "dry" || context.isTeacher
            ? payload.QuestionScore
            : context.kind === "course"
              ? payload.BusValue
              : payload.Score,
        ),
      }));
      questionAt.current = Date.now();
      setNotice(
        teacherMark ? "作答已保存，提交试卷后等待阅卷。" : "本题得分已同步",
      );
      if (!teacherMark) setReveal(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const url = await uploadMathAttachment(file);
      setAnswers((a) => ({ ...a, [id]: url }));
      setNotice("答案图片已上传，请保存本题。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function finish(force = false) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const missing = questions.filter((q) => !existingRecord(context, q).ID);
      if (
        missing.length &&
        context.kind !== "dry" &&
        !context.isTeacher &&
        !(force && context.kind === "weekly")
      )
        throw new Error(
          `还有 ${missing.length} 道题未保存。请逐题保存作答或自评得分后交卷。`,
        );
      if (
        !force &&
        teacherMark &&
        Number(meta.LookMinTime) > 0 &&
        elapsed < Number(meta.LookMinTime) * 60
      )
        throw new Error(`开考 ${meta.LookMinTime} 分钟后可交卷。`);
      const allSystem =
        context.isTeacher &&
        questions.every((q) => existingRecord(context, q).Teacher === "系统");
      const finishResult = await mathExamApi.finish(
        context,
        meta,
        paperlog,
        totalScore,
        elapsed,
        teacherMark,
        allSystem,
        questions,
      );
      setFinished(true);
      setSheet(true);
      setPaperlog((p) => ({
        ...p,
        IsSubmit: 1,
        IsLookScore: teacherMark && !allSystem ? 0 : 1,
      }));
      localStorage.removeItem(draftKey);
      if (!recorded.current) {
        recordActivity({
          platform: "math",
          type: context.kind === "course" ? "course-exam" : "exam",
          title: examName(meta),
          total: questions.length,
          correct: teacherMark
            ? undefined
            : questions.filter(
                (q) =>
                  Number(recordScore(context, existingRecord(context, q))) ===
                  questionMax(q),
              ).length,
          durationSeconds: elapsed,
          path: "/study/exams",
        });
        recorded.current = true;
      }
      setNotice(
        (force ? "作答时间已到，已自动交卷。" : "") +
          (teacherMark && !allSystem
            ? "试卷已提交，正在等待阅卷。"
            : "试卷已提交，成绩已同步。") +
          (finishResult?.warnings?.length
            ? ` 后续学习任务更新提示：${finishResult.warnings.join("；")}`
            : ""),
      );
    } catch (e: any) {
      setError(
        force ? `自动交卷失败：${e.message}。请点击提交试卷重试。` : e.message,
      );
    } finally {
      setLoading(false);
    }
  }
  if (
    teacherRecommendations &&
    context.kind === "course" &&
    context.isTeacher &&
    finished
  )
    return (
      <MathTeacherRecommendations
        stuid={context.stuid}
        QuestionID={question.QuestionID || question.ID}
        PaperID={context.PaperID}
        CourseID={context.CourseID || 0}
        CalendarID={context.CalendarID || 0}
        ProductID={context.ProductID || 0}
        onClose={() => setTeacherRecommendations(false)}
      />
    );
  if (followup)
    return (
      <PaperRunner
        key={JSON.stringify(followup)}
        context={followup}
        onClose={() => setFollowup(null)}
      />
    );
  if (loaded.loading || loaded.error)
    return (
      <div className="panel">
        <button className="math-exam-back" onClick={onClose}>
          <ArrowLeft size={16} />
          返回测评列表
        </button>
        <AsyncStatus
          loading={loaded.loading}
          error={loaded.error}
          reload={loaded.reload}
        />
      </div>
    );
  if (!questions.length)
    return (
      <div className="panel">
        <button className="math-exam-back" onClick={onClose}>
          <ArrowLeft size={16} />
          返回测评列表
        </button>
        <AsyncStatus empty />
      </div>
    );
  if (!started && !finished)
    return (
      <div className="panel math-exam-preview">
        <button className="math-exam-back" onClick={onClose}>
          <ArrowLeft size={16} />
          返回测评列表
        </button>
        <span className="math-exam-badge">
          {context.kind === "dry"
            ? "数学模考"
            : context.kind === "weekly"
              ? "智能周测"
              : "课程测评"}
        </span>
        <h2>{examName(meta)}</h2>
        <div className="math-exam-summary">
          <span>
            <FileText size={20} />
            {questions.length} 道题
          </span>
          <span>
            <Trophy size={20} />
            {maxTotal} 分
          </span>
          <span>
            <Clock3 size={20} />
            自主计时
          </span>
        </div>
        <RichContent
          content={
            meta.Notes ||
            meta.Description ||
            parseExamJson(meta.Json).paperInfoContent
          }
        />
        <p className="math-exam-muted">
          {teacherMark
            ? "本场考试由教师阅卷，请提交完整作答。"
            : "客观题按答案评分，主观题对照解析自评后保存得分。作答草稿保存在当前浏览器，保存答案后同步至平台。"}
        </p>
        <AsyncStatus loading={loading} error={error} />
        <button
          className="btn btn-primary"
          disabled={loading}
          onClick={() => void begin()}
        >
          开始作答
          <ArrowRight size={16} />
        </button>
      </div>
    );
  return (
    <div className="panel math-exam-runner">
      <div className="math-exam-runner-top">
        <button className="math-exam-back" onClick={onClose}>
          <ArrowLeft size={16} />
          返回
        </button>
        <strong>{examName(meta)}</strong>
        <span className="math-exam-timer">
          <Clock3 size={16} />
          {finished ? "已提交" : durationText(elapsed)}
        </span>
        <button className="btn btn-secondary" onClick={() => setSheet(!sheet)}>
          答题卡 {current + 1}/{questions.length}
        </button>
      </div>
      <div className="math-exam-progress">
        <span
          style={{
            width: `${(questions.filter((q) => existingRecord(context, q).ID).length / questions.length) * 100}%`,
          }}
        />
      </div>
      {finished && (
        <div className="math-exam-report">
          <h3>测评报告</h3>
          {(
            <div className="math-exam-summary">
              <span>
                得分{" "}
                <strong>
                  {totalScore} / {maxTotal}
                </strong>
              </span>
              <span>
                已答{" "}
                <strong>
                  {
                    questions.filter((q) => existingRecord(context, q).ID)
                      .length
                  }
                  /{questions.length}
                </strong>
              </span>
              <span>
                用时{" "}
                <strong>
                  {durationText(Number(meta.TotalTime || elapsed))}
                </strong>
              </span>
            </div>
          )}
          <p>
            从答题卡选择题目回顾作答与解析。
          </p>
        </div>
      )}
      {finished && (
        <MathExamReport
          context={context}
          meta={meta}
          paperlog={paperlog}
          questions={questions}
          onReview={(index) => {
            move(index || 0);
            requestAnimationFrame(() =>
              document
                .getElementById("math-exam-question")
                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
            );
          }}
          onOpenPaper={(next) => setFollowup({ ...next, stuid: context.stuid })}
        />
      )}
      {sheet && (
        <div className="math-exam-sheet">
          {questions.map((q, i) => {
            const progress = progressFor(q);
            return (
            <button
              className={`${current === i ? "active" : ""} answer-progress-${progress.state}`}
              key={i}
              aria-label={`第 ${i + 1} 题，${progress.label}`}
              aria-current={current === i ? "step" : undefined}
              title={progress.label}
              onClick={() => move(i)}
            >
              {i + 1}
              {progress.state === "correct" && <Check size={10} />}
              {progress.state === "incorrect" && <X size={10} />}
            </button>
          ); })}
        </div>
      )}
      {(
        <>
          <div id="math-exam-question" className="math-exam-question-title">
            <span className="math-exam-badge">第 {current + 1} 题</span>
            <span>{question.Type || question.QuestionType || "综合题"}</span>
            <span>{max} 分</span>
            {saved && (
              <span className={`math-exam-saved math-exam-result-${currentProgress.state}`}>
                {currentProgress.state === "correct" && <Check size={14} />}
                {currentProgress.state === "incorrect" && <X size={14} />}
                {currentProgress.label}
              </span>
            )}
          </div>
          <MathQuestionStem {...mathQuestionPrompt({ ...question, QuestionTxt: questionText(question), QuestionImg: String(question.QuestionImg || "").replaceAll(".png_yjs", ".png") }, question.QuestionStem || [])} />
          {options.length ? (
            <div className="math-exam-options">
              {options.map((option, i) => {
                const selected = answer.split(",").includes(String(option.ID)),
                  multiple = correctOptionIds(question).length > 1,
                  feedback = mathOptionFeedback(option, options, selected, finished);
                return (
                  <button
                    disabled={finished || loading}
                    className={`math-exam-option ${selected ? "active" : ""} ${feedback}`}
                    key={option.ID || i}
                    onClick={() =>
                      setAnswers((a) => ({
                        ...a,
                        [id]: multiple
                          ? (selected
                              ? answer
                                  .split(",")
                                  .filter((x) => x !== String(option.ID))
                              : [
                                  ...answer.split(",").filter(Boolean),
                                  String(option.ID),
                                ]
                            ).join(",")
                          : String(option.ID),
                      }))
                    }
                  >
                    <span>{String.fromCharCode(65 + i)}</span>
                    <RichContent
                      content={option.Content || option.Answer || ""}
                    />
                    {feedback === "math-choice-incorrect" ? <X size={19} aria-label="回答错误" /> : feedback === "math-choice-correct" && <Check size={19} aria-label="正确答案" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="math-exam-written">
              {teacherMark && /^https?:\/\//i.test(answer) && (
                <a href={safeUrl(answer)} target="_blank" rel="noreferrer">
                  <img
                    className="math-exam-answer-image"
                    src={safeUrl(answer)}
                    alt="已上传的作答"
                  />
                </a>
              )}
              <textarea
                className="input"
                aria-label="解题过程"
                value={answer}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [id]: e.target.value }))
                }
                placeholder="记录解题过程"
                rows={5}
                disabled={finished || loading}
              />
              {teacherMark && !finished && (
                <label className="btn btn-secondary math-exam-upload">
                  上传手写作答
                  <input
                    type="file"
                    accept="image/*"
                    disabled={loading}
                    onChange={(e) => void upload(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          )}
          {!finished && <button className="btn btn-secondary" aria-expanded={reveal} onClick={() => setReveal(value => !value)}>{reveal ? "收起解析" : "查看解析"}</button>}
          {(reveal || finished) && (
            <div className="math-exam-analysis">
              <h3>答案与解析</h3>
              {finished &&
                context.kind === "course" &&
                context.isTeacher && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setTeacherRecommendations(true)}
                  >
                    练习本题的同类题
                    <ChevronRight size={15} />
                  </button>
                )}
              {options.length > 0 && (
                <p>
                  参考答案：
                  {options
                    .filter((o) => Number(o.IsAnswer) === 1)
                    .map((o) => String.fromCharCode(65 + options.indexOf(o)))
                    .join("、")}
                </p>
              )}
              <MathAnalysisContent
                content={
                  question.Analysis ||
                  question.Answer ||
                  question.qAnswer ||
                  question._question_list?.Analysis ||
                  question._question_list?.Answer
                }
              />
              {(Array.isArray(question.Option) ? question.Option : [])
                .filter((a: R) => !["题干", "选项"].includes(a.Type))
                .map((a: R, i: number) => (
                  <MathAnalysisContent
                    key={`option-analysis-${i}`}
                    content={a.Content}
                  />
                ))}
              {(question._analysis || []).map((a: R, i: number) => (
                <MathAnalysisContent key={i} content={a.Content} />
              ))}
              {parseExamJson(question.Json)?.Steps?.map?.((a: R, i: number) => (
                <MathAnalysisContent key={i} content={a.Content || a.content} />
              ))}
              {!options.length && !finished && (
                <label className="math-exam-self-score">
                  本题自评分（0–{max}）
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={max}
                    step={0.5}
                    value={scores[id] ?? ""}
                    disabled={loading}
                    onChange={(e) =>
                      setScores((s) => ({ ...s, [id]: e.target.value }))
                    }
                  />
                </label>
              )}
              {finished && <Info row={old} />}
            </div>
          )}
          <AsyncStatus loading={loading} error={error} />
          {notice && (
            <p className="math-exam-notice" role="status">
              {notice}
            </p>
          )}
          <div className="math-exam-actions">
            <button
              className="btn btn-secondary"
              disabled={current === 0 || loading}
              onClick={() => move(current - 1)}
            >
              <ArrowLeft size={15} />
              上一题
            </button>
            {!finished && (
              <button
                className="btn btn-primary"
                disabled={loading}
                onClick={() => void save()}
              >
                保存本题
              </button>
            )}
            <button
              className="btn btn-secondary"
              disabled={current + 1 >= questions.length || loading}
              onClick={() => move(current + 1)}
            >
              下一题
              <ArrowRight size={15} />
            </button>
            {!finished && (
              <button
                className="btn btn-primary"
                disabled={loading}
                onClick={() => {
                  if (window.confirm("确认提交测评？提交后将生成学习报告。"))
                    void finish();
                }}
              >
                提交试卷
              </button>
            )}
          </div>
          <MathQuestionTools
            key={id}
            stuid={context.stuid}
            qid={question.QuestionID || question.ID}
            bookId={Number(
              question._question_list?.BookID || question.BookID || 0,
            )}
            source={context.kind === "dry" ? "考试" : "课程"}
            isCourse={false}
          />
        </>
      )}
    </div>
  );
}

export function MathCoursePaper({
  stuid,
  PaperID,
  CourseID = 0,
  CalendarID = 0,
  ProductID = 0,
  isAbility = false,
  isTeacher = false,
  onClose,
}: {
  stuid: string;
  PaperID: string | number;
  CourseID?: string | number;
  CalendarID?: string | number;
  ProductID?: string | number;
  isAbility?: boolean;
  isTeacher?: boolean;
  onClose: () => void;
}) {
  const family = useAsync(
    () =>
      isAbility && !isTeacher
        ? mathExamApi.abilityTeacherMode({
            kind: "course",
            stuid,
            PaperID,
            CourseID,
            CalendarID,
            ProductID,
            isAbility,
          })
        : Promise.resolve(isTeacher),
    JSON.stringify([
      stuid,
      PaperID,
      CourseID,
      CalendarID,
      ProductID,
      isAbility,
      isTeacher,
    ]),
  );
  if (isAbility && (family.loading || family.error))
    return (
      <>
        <button className="math-exam-back" onClick={onClose}>
          <ArrowLeft size={16} />
          返回能力测评
        </button>
        <AsyncStatus
          loading={family.loading}
          error={family.error}
          reload={family.reload}
        />
      </>
    );
  return (
    <PaperRunner
      context={{
        kind: "course",
        stuid,
        PaperID,
        CourseID,
        CalendarID,
        ProductID,
        isAbility,
        isTeacher: isAbility ? !!family.data : isTeacher,
      }}
      onClose={onClose}
    />
  );
}

function DryApplication({
  exam,
  stuid,
  onClose,
  onStart,
}: {
  exam: R;
  stuid: string;
  onClose: () => void;
  onStart: (context: MathPaperContext) => void;
}) {
  const info = useAsync(async () => {
      const [detail, registration] = await Promise.all([
        mathExamApi.dryInfo(exam.ID, stuid),
        mathExamApi.application(exam.ID, stuid),
      ]);
      return { detail, registration };
    }, `${exam.ID}-${stuid}`),
    [school, setSchool] = useState(""),
    [major, setMajor] = useState(""),
    [undergrad, setUndergrad] = useState(""),
    [status, setStatus] = useState(""),
    [year, setYear] = useState(""),
    [room, setRoom] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const detail = table(info.data?.detail)[0] || exam,
    paper = table(info.data?.detail, 1)[0] || {},
    rooms = table(info.data?.detail, 5),
    registration = table(info.data?.registration)[0] || {},
    history = table(info.data?.detail, 3)[0] || {},
    enrolled = !!registration.ID,
    subjectJson = parseExamJson(detail.Json);
  useEffect(() => {
    if (info.data) {
      setSchool(registration.BusValue || "");
      setMajor(registration.Json || "");
      setUndergrad(registration.Standby || "");
      setStatus(registration.ExamCount || "");
      setYear(registration.Standby1 || "");
      setRoom(String(registration.RoomID || ""));
    }
  }, [info.data]);
  async function enroll() {
    setLoading(true);
    setError("");
    try {
      if (!school || !major || !undergrad || !status || !year || !room)
        throw new Error("请完善报名信息并选择考场。");
      const payload: R = {
        BusType: "考试用户",
        FunctionID: exam.ID,
        StuID: stuid,
        BusID: detail.PaperID || paper.ID,
        System_Station_ID: 1,
        Notes: "Web报名",
        PowerCount: "0",
        BusValue: school,
        Json: major,
        RoomID: room,
        ExamCount: status,
        Standby: undergrad,
        Standby1: year,
      };
      if (registration.ID) {
        payload.ID = registration.ID;
        payload.UpdateColumns =
          "BusValue,Json,ExamCount,Standby,Standby1,RoomID";
      }
      await mathPost(
        "/api/sys_users_function_allocation/Inner_sys_users_function_allocation",
        payload,
      );
      setNotice("报名信息已保存");
      info.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  function begin() {
    const userRoot = Number(registration.UserRoot || 0);
    onStart({
      kind: "dry",
      stuid,
      DryID: detail.ID || exam.ID,
      PaperID: detail.PaperID || paper.ID,
      RoomID: room,
      UserRoot: userRoot,
    });
  }
  return (
    <div className="panel">
      <button className="math-exam-back" onClick={onClose}>
        <ArrowLeft size={16} />
        全部测评
      </button>
      <AsyncStatus
        loading={info.loading}
        error={info.error}
        reload={info.reload}
      />
      {!info.loading && !info.error && (
        <>
          <span className="math-exam-badge">
            {enrolled ? "已报名" : "数学模考"}
          </span>
          <h2>{examName(detail)}</h2>
          <Info row={detail} />
          <RichContent
            content={
              detail.Description ||
              detail.Notes ||
              subjectJson.paperInfoContent ||
              ""
            }
          />
          {safeUrl(detail.ExamDetails) && (
            <a
              className="math-exam-link"
              href={safeUrl(detail.ExamDetails)}
              target="_blank"
              rel="noreferrer"
            >
              查看考试说明
              <ArrowRight size={15} />
            </a>
          )}
          {paper.AswerPdfFiles && (
              <MathReportDownloads
                sources={[{ AswerPdfFiles: paper.AswerPdfFiles }]}
              />
            )}
          <h3>报名信息</h3>
          <form
            className="math-exam-form"
            onSubmit={(e) => {
              e.preventDefault();
              void enroll();
            }}
          >
            <label>
              本科学校
              <input
                className="input"
                value={undergrad}
                onChange={(e) => setUndergrad(e.target.value)}
                required
              />
            </label>
            <label>
              报考院校
              <input
                className="input"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                required
              />
            </label>
            <label>
              报考专业
              <input
                className="input"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
                required
              />
            </label>
            <label>
              学习状态
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                required
              >
                <option value="">请选择</option>
                {["应届", "二战及以上", "在职"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              报考年份
              <input
                className="input"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
              />
            </label>
            <label>
              考试场次
              <select
                className="input"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                required
              >
                <option value="">请选择考场</option>
                {rooms
                  .map((r, i) => (
                    <option
                      key={i}
                      value={r.ID}
                    >
                      {r.Name || r.RoomName || `场次 ${i + 1}`} ·{" "}
                      {r.ExamStartTime || ""}
                      {r.RoomPeopleNum
                        ? `（${r.counts || 0}/${r.RoomPeopleNum}）`
                        : ""}
                    </option>
                  ))}
              </select>
            </label>
            <div className="math-exam-form-actions">
              <button
                className="btn btn-primary"
                disabled={loading}
              >
                {enrolled ? "保存报名信息" : "确认报名"}
              </button>
              {(
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={begin}
                >
                  {Number(history.IsSubmit) ? "查看作答与报告" : "进入考场"}
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </form>
          <AsyncStatus loading={loading} error={error} />
          {notice && <p className="math-exam-notice">{notice}</p>}
        </>
      )}
    </div>
  );
}

function Ranking({
  exam,
  stuid,
  onClose,
}: {
  exam: R;
  stuid: string;
  onClose: () => void;
}) {
  const [school, setSchool] = useState(""),
    [major, setMajor] = useState(""),
    [query, setQuery] = useState({ school: "", major: "" }),
    [group, setGroup] = useState(0);
  const ranking = useAsync(
      () => mathExamApi.ranking(exam.ID, query.school, query.major),
      `${exam.ID}-${query.school}-${query.major}`,
    ),
    statistics = useAsync(
      () => mathExamApi.statistics(exam.ID, stuid),
      `${exam.ID}-${stuid}`,
    );
  return (
    <div className="panel">
      <button className="math-exam-back" onClick={onClose}>
        <ArrowLeft size={16} />
        全部测评
      </button>
      <h2>{examName(exam)} · 排行榜</h2>
      <Info row={table(statistics.data)[0] || {}} />
      <form
        className="math-exam-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ school, major });
        }}
      >
        <input
          className="input"
          aria-label="按院校筛选排名"
          placeholder="报考院校"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
        />
        <input
          className="input"
          aria-label="按专业筛选排名"
          placeholder="报考专业"
          value={major}
          onChange={(e) => setMajor(e.target.value)}
        />
        <button className="btn btn-secondary">筛选</button>
        <select
          className="input"
          aria-label="排名组别"
          value={group}
          onChange={(e) => setGroup(Number(e.target.value))}
        >
          <option value={0}>全部排名</option>
          <option value={1}>精批榜</option>
          <option value={2}>自批榜</option>
        </select>
      </form>
      <AsyncStatus
        loading={ranking.loading}
        error={ranking.error}
        empty={
          !ranking.loading &&
          !ranking.error &&
          !table(ranking.data, group).length
        }
        reload={ranking.reload}
      />
      {table(ranking.data, group).map((r, i) => (
        <div className="math-exam-ranking-row" key={i}>
          <span className="math-exam-rank">{r.rank1 || r.rank || i + 1}</span>
          <div>
            <strong>{r.UserNick || r.NickName || r.Name || "学习者"}</strong>
            <span>
              {r.SchoolName || ""}
              {r.MajorName ? ` · ${r.MajorName}` : ""}
            </span>
          </div>
          <strong>{r.Score ?? "—"} 分</strong>
        </div>
      ))}
    </div>
  );
}

function WeeklyCreator({
  stuid,
  onClose,
  onCreated,
}: {
  stuid: string;
  onClose: () => void;
  onCreated: (PaperID: string | number) => void;
}) {
  const { subject, stage: planStage } = useMathLearningPlan();
  const configs = useAsync(() => mathExamApi.weeklyConfigs(), "weekly-configs"),
    scopes = useAsync(() => mathExamApi.scopes(), "weekly-scopes"),
    [config, setConfig] = useState(""),
    [stage, setStage] = useState(weeklyStageCode(planStage)),
    [name, setName] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setStage(weeklyStageCode(planStage)), [planStage]);
  useEffect(() => setSelected([]), [subject]);
  const grouped: R[] = Array.from(
    new Map(
      table(configs.data).map((row) => [
        String(row.PID),
        { ...row, ID: row.PID },
      ]),
    ).values(),
  );
  async function create() {
    setLoading(true);
    setError("");
    try {
      if (!config || !selected.length)
        throw new Error("请选择试卷配置和考察范围。");
      const response = await mathExamApi.createWeekly({
        StuID: stuid,
        ID: config,
        code: selected.join(","),
        busvalue: weeklySubjectCode(subject),
        busid: Number(stage),
        name,
      });
      const result = mathData(response);
      if (!result?.PaperID)
        throw new Error(
          typeof result === "string" ? result : "上游没有返回试卷编号。",
        );
      onCreated(result.PaperID);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="panel">
      <button className="math-exam-back" onClick={onClose}>
        <ArrowLeft size={16} />
        全部测评
      </button>
      <h2>智能组卷</h2>
      <p className="math-exam-muted">
        按已选范围和备考阶段生成试卷。
      </p>
      <AsyncStatus
        loading={configs.loading || scopes.loading}
        error={configs.error || scopes.error}
      />
      <form
        className="math-exam-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label>
          试卷名称
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="给本次测评起个名字"
          />
        </label>
        <label>
          目标科目
          <input className="input" value={`${subject} · 已沿用备考目标`} readOnly />
        </label>
        <label>
          本卷难度{planStage === "真题" ? "（真题阶段默认强化）" : ""}
          <select
            className="input"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="1">基础</option>
            <option value="2">强化</option>
            <option value="3">冲刺</option>
          </select>
        </label>
        <label>
          试卷配置
          <select
            className="input"
            required
            value={config}
            onChange={(e) => setConfig(e.target.value)}
          >
            <option value="">请选择</option>
            {grouped.map((c) => (
              <option value={c.ID} key={c.ID}>
                {c.Name || c.Title || "测评配置"}
                {c.TotalScore ? ` · ${c.TotalScore}分` : ""}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="math-exam-scope">
          <legend>考察范围</legend>
          {table(scopes.data)
            .filter((r) => r.PID)
            .map((r, i) => (
              <label key={i}>
                <input
                  type="checkbox"
                  checked={selected.includes(String(r.Code))}
                  onChange={(e) =>
                    setSelected((a) =>
                      e.target.checked
                        ? [...a, String(r.Code)]
                        : a.filter((c) => c !== String(r.Code)),
                    )
                  }
                />
                {r.Name}
              </label>
            ))}
        </fieldset>
        <button
          className="btn btn-primary"
          disabled={loading || !config || !selected.length}
        >
          生成试卷
          <ArrowRight size={16} />
        </button>
      </form>
      <AsyncStatus loading={loading} error={error} />
    </div>
  );
}

export default function MathExams({ stuid }: { stuid: string }) {
  const { subject } = useMathLearningPlan();
  const [kind, setKind] = useState("dry"),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [application, setApplication] = useState<R | null>(null),
    [ranking, setRanking] = useState<R | null>(null),
    [paper, setPaper] = useState<MathPaperContext | null>(null),
    [create, setCreate] = useState(false);
  const [selectedWeekly, setSelectedWeekly] = useState<string[]>([]),
    [confirmDelete, setConfirmDelete] = useState(false),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState(""),
    [deleteNotice, setDeleteNotice] = useState("");
  useEffect(() => setPage(1), [subject]);
  const list = useAsync(
      () =>
        kind === "weekly"
          ? mathExamApi.weeklyList(stuid)
          : mathExamApi.dryList(stuid, subject, kind, page),
      `${kind}-${subject}-${page}-${stuid}`,
    ),
    rows = table(list.data).filter((r) => examName(r).includes(search));
  async function removeWeekly() {
    setDeleting(true);
    setDeleteError("");
    setDeleteNotice("");
    try {
      await mathExamApi.deleteWeekly(stuid, selectedWeekly);
      setDeleteNotice(`已删除所选 ${selectedWeekly.length} 份周测试卷。`);
      setSelectedWeekly([]);
      setConfirmDelete(false);
      list.reload();
    } catch (e: any) {
      setDeleteError(e.message);
    } finally {
      setDeleting(false);
    }
  }
  if (paper)
    return (
      <PaperRunner
        key={JSON.stringify(paper)}
        context={paper}
        onClose={() => {
          setPaper(null);
          list.reload();
        }}
      />
    );
  if (application)
    return (
      <DryApplication
        exam={application}
        stuid={stuid}
        onClose={() => setApplication(null)}
        onStart={setPaper}
      />
    );
  if (ranking)
    return (
      <Ranking exam={ranking} stuid={stuid} onClose={() => setRanking(null)} />
    );
  if (create)
    return (
      <WeeklyCreator
        stuid={stuid}
        onClose={() => setCreate(false)}
        onCreated={(PaperID) => {
          setCreate(false);
          setPaper({ kind: "weekly", stuid, PaperID });
        }}
      />
    );
  return (
    <div className="math-exams">
      <div className="tabs">
        {[
          ["dry", "数学模考"],
          ["stage", "阶段测评"],
          ["weekly", "智能周测"],
          ["mine", "我的模考"],
        ].map(([value, title]) => (
          <button
            key={value}
            className={kind === value ? "active" : ""}
            onClick={() => {
              setKind(value);
              setPage(1);
              setSelectedWeekly([]);
              setConfirmDelete(false);
              setDeleteError("");
              setDeleteNotice("");
            }}
          >
            {title}
          </button>
        ))}
      </div>
      <div className="panel math-exam-toolbar">
        {kind !== "weekly" && <span className="math-tag">{subject} · 已沿用备考目标</span>}
        <input
          className="input"
          aria-label="筛选测评"
          placeholder="按测评名称筛选"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedWeekly([]);
            setConfirmDelete(false);
          }}
        />
        <button className="btn btn-primary" onClick={() => setCreate(true)}>
          智能组卷
          <ArrowRight size={16} />
        </button>
      </div>
      {kind === "weekly" && (
        <div className="panel math-exam-toolbar">
          <label>
            <input
              type="checkbox"
              aria-label="选择当前列表全部周测试卷"
              disabled={deleting || !rows.length}
              checked={
                rows.length > 0 &&
                rows.every((r) => selectedWeekly.includes(String(r.ID)))
              }
              onChange={(e) => {
                setSelectedWeekly(
                  e.target.checked ? rows.map((r) => String(r.ID)) : [],
                );
                setConfirmDelete(false);
              }}
            />{" "}
            全选
          </label>
          <span>已选 {selectedWeekly.length} 份</span>
          <button
            className="btn btn-secondary"
            disabled={!selectedWeekly.length || deleting}
            onClick={() => setConfirmDelete(true)}
          >
            删除所选周测
          </button>
        </div>
      )}
      {kind === "weekly" && confirmDelete && (
        <div className="error-banner">
          <span>
            确定删除所选 {selectedWeekly.length}{" "}
            份周测试卷及个人记录？删除后不可恢复。
          </span>
          <button
            className="btn btn-secondary"
            disabled={deleting}
            onClick={() => setConfirmDelete(false)}
          >
            取消
          </button>
          <button
            className="btn btn-primary"
            disabled={deleting}
            onClick={() => void removeWeekly()}
          >
            {deleting ? "正在删除…" : "确认删除"}
          </button>
        </div>
      )}
      {deleteError && (
        <p className="error-banner" role="alert">
          {deleteError}
        </p>
      )}
      {deleteNotice && (
        <p className="math-account-notice" role="status">
          {deleteNotice}
        </p>
      )}
      <div className="panel">
        <AsyncStatus
          loading={list.loading}
          error={list.error}
          empty={!list.loading && !list.error && !rows.length}
          reload={list.reload}
        />
        {rows.map((exam, i) => (
          <article className="math-exam-list-row" key={exam.ID || i}>
            {kind === "weekly" && (
              <input
                type="checkbox"
                aria-label={`选择周测 ${examName(exam)}`}
                disabled={deleting}
                checked={selectedWeekly.includes(String(exam.ID))}
                onChange={() => {
                  setSelectedWeekly((v) =>
                    v.includes(String(exam.ID))
                      ? v.filter((id) => id !== String(exam.ID))
                      : [...v, String(exam.ID)],
                  );
                  setConfirmDelete(false);
                }}
              />
            )}
            <span className="math-exam-paper-icon">
              <FileText size={22} />
            </span>
            <div className="math-exam-grow">
              <span className="math-exam-badge">
                {kind === "weekly"
                  ? Number(exam.IsSubmit) === 1
                    ? "已完成"
                    : "待作答"
                  : exam.BusValue || "数学模考"}
              </span>
              <h3>{examName(exam)}</h3>
              <p>
                {kind === "weekly"
                  ? `${exam.QuestionNum || exam.Num || "—"} 题 · ${exam.TotalScore || exam.TotalScores || "—"} 分`
                  : `${exam.ExamStartTime || "时间待公布"}${exam.ExamEndTime ? ` — ${exam.ExamEndTime}` : ""}`}
              </p>
              {kind === "weekly" && exam.StartTime && (
                <p>开始于 {exam.StartTime}</p>
              )}
            </div>
            {kind === "weekly" ? (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const next = window.prompt("试卷名称", examName(exam));
                    if (next?.trim())
                      void mathPost("/api/ks_paper/Inner_ks_paper", {
                        ID: exam.ID,
                        Name: next.trim(),
                        UpdateColumns: "ID,Name",
                      })
                        .then(list.reload)
                        .catch((e) => window.alert(e.message));
                  }}
                >
                  重命名
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    setPaper({
                      kind: "weekly",
                      stuid,
                      PaperID: exam.ID || exam.PaperID,
                    })
                  }
                >
                  {Number(exam.IsSubmit) === 1 ? "查看报告" : "进入测评"}
                  <ChevronRight size={15} />
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => setRanking(exam)}
                >
                  <Trophy size={15} />
                  排名
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setApplication(exam)}
                >
                  考试详情
                  <ChevronRight size={15} />
                </button>
              </>
            )}
          </article>
        ))}
        {kind !== "weekly" && (
          <div className="math-exam-pager">
            <button
              className="btn btn-secondary"
              disabled={page === 1 || list.loading}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              className="btn btn-secondary"
              disabled={table(list.data).length < 20 || list.loading}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
