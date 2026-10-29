import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import RichContent from "../RichContent";
import LearningWorkbench from "../learning/LearningWorkbench";
import { useSession } from "../../lib/session";
import { recordActivity } from "../../lib/store";
import {
  computerRequest as request,
  buildComputerAnswer,
  buildComputerSubmission,
  computerClozeGroups,
  restoreComputerAnswers,
  computerSkippedIds,
  computerUpload,
  exerciseSource,
  extractExercises,
  plain,
  records,
  safeLink,
  typeNames,
} from "../../platforms/computer";
import type { ComputerRecord as R } from "../../platforms/computer";
import {
  buildComputerRedo,
  computerLearningApi,
  computerReviewData,
} from "./computer-learning";
import type { ComputerExerciseLaunch as ExerciseLaunch } from "./computer-learning";
import ComputerQuestionTools, {
  ComputerInterviewRecorder,
} from "./ComputerQuestionTools";
import { ComputerExamReport } from "./ComputerReports";
import ComputerKnowledgeTags from "./ComputerKnowledgeTags";
import ComputerQuestionVideo from "./ComputerQuestionVideo";
import { computerAnalysisVisible, computerAnswerMode, computerChoiceAnswer, computerDraftScope, computerImmediateChoice, computerOptionFeedback, computerQuestionProgress } from "./question-workflow.mjs";
import "./question-workflow.css";
import "../learning/answer-progress.css";
function Status({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  retry?: () => void;
}) {
  return loading ? (
    <div className="computer-status" role="status">
      <LoaderCircle className="spin" size={18} />
      正在读取学习内容…
    </div>
  ) : error ? (
    <div className="computer-error" role="alert">
      {error}
      {retry && (
        <button className="btn btn-secondary" onClick={retry}>
          重试
        </button>
      )}
    </div>
  ) : empty ? (
    <div className="empty-state">
      <BookOpen size={28} />
      <h3>这里还没有可用题目</h3>
    </div>
  ) : null;
}
export default function ExerciseSession({
  launch,
  onClose,
}: {
  launch: ExerciseLaunch;
  onClose: () => void;
}) {
  const { session } = useSession();
  const sessionElement = useRef<HTMLElement>(null);
  const [related, setRelated] = useState<ExerciseLaunch | null>(null),
    [finalReport, setFinalReport] = useState<R | null>(null);
  const initial = extractExercises(launch.data),
    [questions, setQuestions] = useState(initial),
    [current, setCurrent] = useState(Number(launch.data.initialIndex || 0)),
    [answers, setAnswers] = useState<Record<string, string>>(() =>
      restoreComputerAnswers(launch.data),
    ),
    [submitted, setSubmitted] = useState<Record<string, R>>(() =>
      Object.fromEntries(
        [
          ...records(launch.data.answerList),
          ...records(launch.data.answers),
        ].map((a) => [String(a.exerciseId), a]),
      ),
    ),
    [skipped, setSkipped] = useState<string[]>(() => computerSkippedIds(launch.data)),
    [collected, setCollected] = useState<string[]>(
      launch.data.collectExerciseId || (launch.data.collected && launch.data.exerciseId ? [String(launch.data.exerciseId)] : []),
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [showSheet, setShowSheet] = useState(true),
    [finished, setFinished] = useState(false),
    [note, setNote] = useState(""),
    [noteVisible, setNoteVisible] = useState(false),
    [draftLoaded, setDraftLoaded] = useState(false),
    [failedSubmission, setFailedSubmission] = useState(false),
    [ai, setAi] = useState<Record<string, R>>({});
  const started = useRef(Date.now()),
    questionStarted = useRef(Date.now()),
    lastActivity = useRef(Date.now()),
    progressRecord = useRef(String(launch.data.examRecordId || launch.recordId || "")),
    recordedIds = useRef(new Set<string>()),
    submissionPending = useRef(false);
  const answerMode = computerAnswerMode(launch);
  const isPaper = answerMode === "paper";
  const question = questions[current] || {},
    id = String(question.exerciseId || question.id || ""),
    type = Number(question.exerciseType),
    answer = answers[id] || "",
    isReadOnly = !!launch.readOnly,
    hasSubmitted = computerAnalysisVisible(launch, !!submitted[id], finished, skipped.includes(id)),
    total = Number(launch.data.exerciseTotalNumber || questions.length),
    examId = launch.data.examId || launch.data.examinationId,
    score = Number(
      question.exerciseTotalScore || question.exerciseProperty?.score || 2,
    );
  const isSequential =
      !!launch.redo || [3, 10, 18, 19].includes(launch.examType),
    category = launch.examCategory || 1;
  const immediateChoice = computerImmediateChoice(launch, type);
  const storageKey = `study:computer:draft:${computerDraftScope(session)}:${launch.majorId}:${category}:${examId || launch.chapterId || "random"}:${launch.examType}:${launch.examGroupId || ""}:${launch.redo ? `${launch.redo.kind}:${launch.redo.dateFlag}:${launch.redo.sort}` : ""}`;
  useEffect(() => {
    async function restore() {
      let index = Number(launch.data.initialIndex || 0);
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (saved?.answers && !isReadOnly) {
          setAnswers((a) => ({ ...a, ...saved.answers }));
          index = Math.max(0, Math.min(Number(saved.current) || 0, total - 1));
        } else if (
          isSequential &&
          !isReadOnly &&
          Number(launch.data.sheetIndex) > 0
        )
          index = Math.min(Number(launch.data.sheetIndex) - 1, total - 1);
      } catch {}
      if (index > 0 && !questions[index]) await move(index);
      else setCurrent(index);
      setDraftLoaded(true);
    }
    void restore();
  }, [storageKey]);
  useEffect(() => {
    if (draftLoaded && !isReadOnly)
      localStorage.setItem(
        storageKey,
        JSON.stringify({ answers, current, updated: Date.now() }),
      );
  }, [answers, current, storageKey, isReadOnly, draftLoaded]);
  function setAnswer(value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }
  function answerPayload(item: R, skip = false, currentAnswers = answers) {
    const itemId = String(item.exerciseId || item.id);
    return buildComputerAnswer({
      question: item,
      answer: currentAnswers[itemId] || "",
      majorId: launch.majorId,
      chapterId: launch.chapterId,
      examType: launch.examType,
      answerSource: launch.answerSource,
      deriveMajor: launch.deriveMajor,
      startedAt: questionStarted.current,
      skip: skip || skipped.includes(itemId),
      aiResult: ai[itemId],
    });
  }
  async function submit(skip = false, all = false, selectedAnswer?: string) {
    if (submissionPending.current || isReadOnly || (isPaper && !all)) return;
    const currentAnswers = selectedAnswer === undefined ? answers : { ...answers, [id]: selectedAnswer };
    const currentAnswer = currentAnswers[id] || "";
    setError("");
    if (
      all &&
      questions.some(
        (q) =>
          !currentAnswers[String(q.exerciseId || q.id)] &&
          !ai[String(q.exerciseId || q.id)],
      ) &&
      !window.confirm("还有未作答的题目，确认交卷？")
    )
      return;
    if (!skip && !all && !currentAnswer.trim() && !ai[id]) {
      setError("请先选择或填写答案。");
      return;
    }
    submissionPending.current = true;
    setFailedSubmission(false);
    setLoading(true);
    try {
      const selected = all ? questions : [question];
      if (!selected.length) throw new Error("请先完成至少一道题。");
      const payload = buildComputerSubmission({
        answers: selected.map(
          (q) =>
            (!isPaper && submitted[String(q.exerciseId || q.id)]) || answerPayload(q, skip, currentAnswers),
        ),
        examinationId: examId,
        examType: launch.examType,
        startedAt: started.current,
        complete: all,
        skip,
        examCategory: category,
      });
      let result: any;
      if (launch.redo) {
        const redo = buildComputerRedo(
          {
            ...question,
            majorId: question.majorId || launch.majorId,
            chapterId: question.chapterId || launch.chapterId,
          },
          currentAnswer,
          launch.answerSource || 4,
          category,
          questionStarted.current,
        );
        result = await computerLearningApi.redo(redo);
        payload.answers = [redo];
      } else
        result = await request(
          launch.random
            ? "/api/exam/wx/practice/random/answer/submit"
            : "/api/exam/wx/practice/submitExam",
          {},
          "POST",
          payload,
        );
      setSubmitted((s) => ({
        ...s,
        ...Object.fromEntries(payload.answers.map((a) => [a.exerciseId, a])),
      }));
      if (skip) setSkipped((ids) => [...new Set([...ids, id])]);
      setNotice(all ? "试卷已提交，学习记录已同步。" : [1, 2, 5, 7].includes(type)
        ? payload.answers[0]?.answerType === 1 ? "回答正确，答案已保存。" : "回答有误，已保存作答并显示解析。"
        : "答案已保存至计算机学习记录。");
      const newlyRecorded = payload.answers.filter(
        (a) =>
          !recordedIds.current.has(a.exerciseId) &&
          (a.answer || a.llmAnswer || a.answerType === 4),
      );
      if (newlyRecorded.length) {
        recordActivity({
          platform: "computer",
          type: all ? "exam" : "practice",
          title: launch.title,
          total: newlyRecorded.length,
          correct: newlyRecorded.filter((a) => a.answerType === 1).length,
          durationSeconds: Math.round(
            (Date.now() - lastActivity.current) / 1000,
          ),
          path: "/study/review",
        });
        newlyRecorded.forEach((a) => recordedIds.current.add(a.exerciseId));
        lastActivity.current = Date.now();
      }
      if (all) {
        setFinished(true);
        localStorage.removeItem(storageKey);
        try {
          await readSubmittedReport(result?.examRecordId);
        } catch (reportError: any) {
          setError(`试卷已提交，报告暂未读取成功：${reportError.message}`);
        }
      }
      questionStarted.current = Date.now();
      if (result?.score != null) setNotice(`已提交，得分 ${result.score}。`);
    } catch (e: any) {
      setFailedSubmission(true);
      setError(e.message);
    } finally {
      submissionPending.current = false;
      setLoading(false);
    }
  }
  async function readSubmittedReport(returnedRecordId?: string) {
    const report = await computerLearningApi.submittedReport({
      recordId: returnedRecordId || progressRecord.current || undefined,
      examinationId: String(examId), majorId: launch.majorId,
      examType: launch.examType, examCategory: category,
    });
    if (report?.examRecord?.id) progressRecord.current = String(report.examRecord.id);
    setFinalReport(report);
  }
  async function refreshSubmittedReport() {
    setLoading(true); setError("");
    try { await readSubmittedReport(); }
    catch (reportError: any) { setError(`试卷已提交，报告暂未读取成功：${reportError.message}`); }
    finally { setLoading(false); }
  }
  async function move(index: number) {
    if (index < 0 || index >= total) return;
    setError("");
    setNotice("");
    setFailedSubmission(false);
    questionStarted.current = Date.now();
    if (!questions[index] && total > 1) {
      setLoading(true);
      try {
        const data = launch.redo
          ? computerReviewData(
              await computerLearningApi.reviewPage(launch.redo.kind, {
                majorId: launch.majorId,
                chapterId: launch.chapterId,
                pageNum: index + 1,
                pageSize: 1,
                dateFlag: launch.redo.dateFlag,
                sort: launch.redo.sort,
                examCategory: category,
              }),
            )
          : await request("/api/exam/wx/practice/exerciseList", {
              majorId: launch.majorId,
              chapterId: launch.chapterId,
              examType: launch.examType,
              examCategory: category,
              number: index + 1,
              examExerciseType: launch.examExerciseType,
              examGroupId: launch.examGroupId,
              sectionId: launch.sectionId,
            });
        const next = extractExercises(data);
        setSkipped((ids) => [...new Set([...ids, ...computerSkippedIds(data)])]);
        if(data.examRecordId)progressRecord.current=String(data.examRecordId);
        setQuestions((q) => {
          const updated = [...q];
          updated[index] = next[0];
          return updated;
        });
        setCurrent(index);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    } else setCurrent(index);
    if (sessionElement.current && sessionElement.current.getBoundingClientRect().width < 1000)
      setShowSheet(false);
    if(!isReadOnly&&!launch.redo&&isSequential&&progressRecord.current) {
      try {await computerLearningApi.saveSheetIndex(progressRecord.current,index+1);}
      catch(error:any){setNotice(`题目已切换，云端续学位置尚未同步：${error.message}`);}
    }
  }
  async function collect() {
    setLoading(true);
    setError("");
    try {
      const removing = collected.includes(id);
      await request("/api/exam/wx/personal/collectExercise", {
        majorId: question.majorId || launch.majorId,
        chapterId: launch.chapterId || "",
        exerciseId: id,
        collectFlag: removing ? 1 : 0,
        examCategory: category,
      });
      setCollected((c) => (removing ? c.filter((x) => x !== id) : [...c, id]));
      setNotice(removing ? "已取消收藏" : "已收藏");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function saveNote() {
    setLoading(true);
    setError("");
    try {
      await request("/api/exam/wx/personal/addExerciseNote", {
        collectExerciseId: id,
        exerciseNote: note,
        majorId: question.majorId || launch.majorId,
        examCategory: category,
      });
      setNotice("笔记已同步");
      setNoteVisible(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function uploadAnswer(file?: File) {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const uploaded = await computerUpload(file),
        url = uploaded.previewUrl || uploaded.url;
      if (!url) throw new Error("上传成功，但上游没有返回图片地址。");
      const result = await request(
        "/api/exam/wx/practice/ai/score",
        {},
        "POST",
        {
          answer: [url],
          exerciseId: id,
          majorId: launch.majorId,
          chapterId: launch.chapterId,
          exerciseInfo: { exerciseTotalScore: score },
        },
      );
      setAi((a) => ({ ...a, [id]: result }));
      setAnswer(url);
      setNotice("AI 批阅完成，请确认后提交。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  if (related)
    return (
      <ExerciseSession
        key={`${related.data.examId}-${related.title}`}
        launch={related}
        onClose={() => setRelated(null)}
      />
    );
  if (!questions.length)
    return (
      <div className="panel">
        <button className="btn btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} />
          返回
        </button>
        <Status empty />
      </div>
    );
  return (
    <LearningWorkbench
      title={launch.title}
      previous={current > 0 ? () => void move(current - 1) : undefined}
      next={current + 1 < total ? () => void move(current + 1) : undefined}
      disabled={loading || !!related}
    >
    <section ref={sessionElement} className="computer-session panel" onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !hasSubmitted && !isPaper && !loading) {
        event.preventDefault();
        void submit();
      }
    }}>
      <div className="computer-session-top">
        <button className="computer-back" onClick={onClose}>
          <ArrowLeft size={18} />
          返回
        </button>
        <span>{launch.title}</span>
        <button
          className="btn btn-secondary"
          aria-expanded={showSheet}
          aria-controls="computer-answer-sheet"
          onClick={() => setShowSheet(!showSheet)}
        >
          {showSheet ? "收起答题卡" : "展开答题卡"} {current + 1}/{total}
        </button>
      </div>
      <div className="computer-progress">
        <span style={{ width: `${((current + 1) / total) * 100}%` }} />
      </div>
      <div className={`computer-session-layout ${showSheet ? "with-sheet" : ""}`}>
      {showSheet && (
        <aside className="computer-sheet-sidebar" id="computer-answer-sheet" aria-label="题号导航">
          <div className="computer-sheet-heading">
            <h3>答题进度</h3>
            <strong>{Math.min(total, new Set([...Object.keys(submitted), ...skipped]).size)} / {total}</strong>
          </div>
          <p className="computer-sheet-help">点击题号跳转，答案草稿会保留。</p>
          <div className="computer-sheet-legend">
            <span><i className="correct" /> 已答对</span>
            <span><i className="incorrect" /> 回答错误</span>
            <span><i className="saved" /> 已保存，待核对</span>
            <span><i className="draft" /> 有草稿</span>
            <span><i /> 未作答</span>
          </div>
          <div className="computer-sheet">
            {Array.from({ length: total }, (_, i) => {
              const questionId = String(questions[i]?.exerciseId || questions[i]?.id || launch.data.examExerciseIdList?.[i] || "");
              const progress = computerQuestionProgress(launch, submitted[questionId], !!answers[questionId], finished, skipped.includes(questionId));
              return (
                <button
                  className={`${i === current ? "active" : ""} answer-progress-${progress.state}`}
                  aria-label={`第 ${i + 1} 题，${progress.label}`}
                  title={progress.label}
                  aria-current={i === current ? "step" : undefined}
                  disabled={loading}
                  key={i}
                  onClick={() => void move(i)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </aside>
      )}
      <div className="computer-question-area">
      <div className="computer-question-heading">
        <span className="computer-pill">{typeNames[type] || "综合题"}</span>
        <span>{score} 分</span>
        <span className="computer-dim">
          {exerciseSource(question.exerciseFrom)}
        </span>
        <button
          aria-label={collected.includes(id) ? "取消收藏" : "收藏题目"}
          className={`computer-icon ${collected.includes(id) ? "selected" : ""}`}
          disabled={loading}
          onClick={() => void collect()}
        >
          <Star
            size={19}
            fill={collected.includes(id) ? "currentColor" : "none"}
          />
        </button>
      </div>
      {finalReport && (
        <ComputerExamReport
          data={finalReport}
          majorId={launch.majorId}
          onOpen={setRelated}
          onRefresh={() => void refreshSubmittedReport()}
        />
      )}
      {finished && !finalReport && (
        <div className="computer-notice"><p>试卷已提交。报告需要从学习平台读取。</p><button className="btn btn-secondary" disabled={loading} onClick={() => void refreshSubmittedReport()}><RefreshCw size={15} />重试读取报告</button></div>
      )}
      <div className={`computer-question-columns ${hasSubmitted ? "with-analysis" : ""}`}>
      <div className="computer-question-answer">
      <RichContent
        content={String(
          question.exerciseStems || question.stem || question.title || "",
        ).replace(/\$\*\$(\d+)\$\*\$/g, " （$1）________ ")}
        className="computer-question-stem"
      />
      {!hasSubmitted && <p className="computer-answer-hint">{isPaper
        ? "答案保留为草稿，交卷后查看答案与解析。"
        : immediateChoice
          ? "点选答案即保存，并显示解析。"
          : type === 2 ? "本题可多选，选好后提交。" : "完成后提交答案，也可按 Ctrl / ⌘ + Enter。"}</p>}
      {launch.voice ? (
        <ComputerInterviewRecorder
          key={`voice-${id}`}
          value={answer}
          disabled={hasSubmitted || loading}
          onAnswer={setAnswer}
        />
      ) : [1, 2, 5].includes(type) ? (
        <div className="computer-options">
          {(type === 5 && !question.questions?.length
            ? [
                { questionStem: "1", questionAnswer: "正确" },
                { questionStem: "0", questionAnswer: "错误" },
              ]
            : question.questions || []
          ).map((option: R, index: number) => {
            const key = String(
                option.questionStem ?? String.fromCharCode(65 + index),
              ),
              selected =
                type === 2 ? answer.split(",").includes(key) : answer === key,
              feedback = computerOptionFeedback(key, question.exerciseAnswer, selected, hasSubmitted);
            return (
              <button
                key={index}
                className={`computer-option ${selected ? "active" : ""} ${feedback}`}
                disabled={hasSubmitted || loading}
                aria-pressed={selected}
                onClick={() => {
                  const selectedAnswer = computerChoiceAnswer(type, answer, key);
                  setAnswer(selectedAnswer);
                  if (immediateChoice) void submit(false, false, selectedAnswer);
                }}
              >
                <span className="computer-option-key">{key}</span>
                <RichContent
                  content={option.questionAnswer || option.content}
                />
                {feedback === "incorrect" ? <X size={19} aria-label="回答错误" /> : (feedback === "correct" || selected) && <Check size={19} aria-label={feedback === "correct" ? "正确答案" : "已选择"} />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="computer-written">
          {type === 7 ? (
            <div className="computer-cloze-inputs">
              {computerClozeGroups(question).map((options, index) => (
                <fieldset key={index}>
                  <legend>第 {index + 1} 小问</legend>
                  {options.map((option, j) => (
                    <button
                      key={j}
                      className={`computer-option ${answer.split(",")[index] === String(option.questionStem) ? "active" : ""}`}
                      disabled={hasSubmitted || loading}
                      onClick={() => {
                        const values = answer.split(",");
                        values[index] = String(option.questionStem);
                        setAnswer(values.join(","));
                      }}
                    >
                      <span className="computer-option-key">
                        {option.questionStem}
                      </span>
                      <RichContent content={option.questionAnswer} />
                    </button>
                  ))}
                </fieldset>
              ))}
            </div>
          ) : type === 3 ? (
            <div className="computer-answer-inputs">
              {Array.from(
                {
                  length: Math.max(
                    1,
                    (question.questions || []).length,
                    (
                      String(question.exerciseStems || "").match(
                        /\$\*\$\d+\$\*\$/g,
                      ) || []
                    ).length,
                  ),
                },
                (_, index) => (
                  <label key={index}>
                    第 {index + 1} {type === 3 ? "空" : "小问"}
                    <input
                      className="input"
                      aria-label={`第 ${index + 1} ${type === 3 ? "空" : "小问"}答案`}
                      disabled={hasSubmitted || loading}
                      value={
                        answer.split(type === 3 ? "$-$" : ",")[index] || ""
                      }
                      onChange={(e) => {
                        const values = answer.split(type === 3 ? "$-$" : ",");
                        values[index] = e.target.value;
                        setAnswer(values.join(type === 3 ? "$-$" : ","));
                      }}
                    />
                  </label>
                ),
              )}
            </div>
          ) : (
            <textarea
              className="input"
              rows={5}
              aria-label="填写答案"
              placeholder="填写解题过程，或上传手写答案进行 AI 批阅"
              disabled={hasSubmitted || loading}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}
          {[3, 4].includes(type) && !hasSubmitted && !launch.voice && (
            <label className="btn btn-secondary computer-upload">
              <ImagePlus size={16} />
              上传答案并 AI 批阅
              <input
                type="file"
                accept="image/*"
                disabled={loading}
                onChange={(e) => void uploadAnswer(e.target.files?.[0])}
              />
            </label>
          )}
          {ai[id] && (
            <div className="computer-feedback">
              <strong>
                AI 评分：{ai[id].finalScore ?? "待评定"} / {score}
              </strong>
              {records(ai[id].llmAnswer).map((a, i) => (
                <RichContent key={i} content={a.scoreReason || a.reason} />
              ))}
            </div>
          )}
        </div>
      )}
      </div>
      {hasSubmitted && <div className="computer-analysis" aria-label="答案与解析">
          <h3>答案与解析</h3>
          {skipped.includes(id) && <p className="computer-dim">本题已跳过，未计为实际作答。</p>}
          {launch.voice && safeLink(answer.split("$-$")[0]) && (
            <audio controls src={safeLink(answer.split("$-$")[0])} />
          )}
          {plain(question.exerciseAnswer) && <p>参考答案：<strong>{plain(question.exerciseAnswer)}</strong></p>}
          <RichContent
            content={
              question.exerciseAnalysis ||
              question.exerciseAnalyze ||
              question.analysis ||
              question.exerciseResolve ||
              ""
            }
          />
          <ComputerKnowledgeTags question={question} majorId={launch.majorId} />
          <ComputerQuestionVideo key={id} question={question} />
          {submitted[id]?.llmAnswer && (
            <div>
              <h4>批阅反馈</h4>
              {(() => {
                try {
                  return records(
                    typeof submitted[id].llmAnswer === "string"
                      ? JSON.parse(submitted[id].llmAnswer)
                      : submitted[id].llmAnswer,
                  ).map((r, i) => (
                    <div key={i}>
                      <p>得分 {r.score ?? r.finalScore ?? "—"}</p>
                      <RichContent
                        content={r.scoreReason || r.reason || r.content || ""}
                      />
                    </div>
                  ));
                } catch {
                  return null;
                }
              })()}
            </div>
          )}
        </div>}
      </div>
      {noteVisible && (
        <div className="computer-note">
          <label>
            学习笔记
            <textarea
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </label>
          <button
            className="btn btn-primary"
            disabled={loading}
            onClick={() => void saveNote()}
          >
            保存笔记
          </button>
        </div>
      )}
      <Status loading={loading} error={error} />
      {notice && (
        <p className="computer-notice" role="status">
          {notice}
        </p>
      )}
      <div className="computer-session-actions">
        <button
          className="btn btn-secondary"
          disabled={current === 0 || loading}
          onClick={() => void move(current - 1)}
        >
          <ArrowLeft size={16} />
          上一题
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setNote(question.exerciseNote || "");
            setNoteVisible(!noteVisible);
          }}
        >
          记笔记
        </button>
        {!hasSubmitted && !isReadOnly && !isPaper && (
          <>
            {[3, 10, 18, 19].includes(launch.examType) && !launch.redo && (
              <button
                className="btn btn-secondary"
                disabled={loading}
                onClick={() => void submit(true)}
              >
                跳过
              </button>
            )}
            {(!immediateChoice || failedSubmission) && <button
              className="btn btn-primary"
              disabled={loading || (!answer.trim() && !ai[id])}
              onClick={() => void submit()}
            >
              {failedSubmission ? "重试提交" : loading ? "保存中…" : "提交答案"}
            </button>}
          </>
        )}
        <button
          className="btn btn-secondary"
          disabled={current + 1 >= total || loading}
          onClick={() => void move(current + 1)}
        >
          下一题
          <ArrowRight size={16} />
        </button>
        {!isReadOnly && !finished && isPaper && (
          <button
            className="btn btn-primary"
            disabled={loading}
            onClick={() => void submit(false, true)}
          >
            交卷
          </button>
        )}
      </div>
      <ComputerQuestionTools
        key={`tools-${id}`}
        question={question}
        majorId={launch.majorId}
        chapterId={launch.chapterId}
        examCategory={category}
        onRelated={(data) =>
          setRelated({
            data,
            title: "同章节同类练习",
            majorId: question.majorId || launch.majorId,
            chapterId: question.chapterId || launch.chapterId,
            examType: category === 2 ? 9 : 2,
            examCategory: category,
            answerSource: 2,
          })
        }
      />
      </div>
      </div>
    </section>
    </LearningWorkbench>
  );
}
