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
} from "lucide-react";
import RichContent from "../RichContent";
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
  computerFeedbackSource,
  computerLearningApi,
  computerReviewData,
} from "./computer-learning";
import type { ComputerExerciseLaunch as ExerciseLaunch } from "./computer-learning";
import ComputerQuestionTools, {
  ComputerInterviewRecorder,
} from "./ComputerQuestionTools";
import { ComputerExamReport } from "./ComputerReports";
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
    [showSheet, setShowSheet] = useState(false),
    [finished, setFinished] = useState(false),
    [note, setNote] = useState(""),
    [noteVisible, setNoteVisible] = useState(false),
    [draftLoaded, setDraftLoaded] = useState(false),
    [ai, setAi] = useState<Record<string, R>>({});
  const started = useRef(Date.now()),
    questionStarted = useRef(Date.now()),
    lastActivity = useRef(Date.now()),
    progressRecord = useRef(String(launch.data.examRecordId || launch.recordId || "")),
    recordedIds = useRef(new Set<string>());
  const question = questions[current] || {},
    id = String(question.exerciseId || question.id || ""),
    type = Number(question.exerciseType),
    answer = answers[id] || "",
    isReadOnly = !!launch.readOnly,
    hasSubmitted = !!submitted[id] || skipped.includes(id) || isReadOnly,
    total = Number(launch.data.exerciseTotalNumber || questions.length),
    examId = launch.data.examId || launch.data.examinationId,
    score = Number(
      question.exerciseTotalScore || question.exerciseProperty?.score || 2,
    );
  const isSequential =
      !!launch.redo || [3, 10, 18, 19].includes(launch.examType),
    category = launch.examCategory || 1;
  const storageKey = `study:computer:draft:${session.account?.ref || "guest"}:${launch.majorId}:${category}:${examId || launch.chapterId || "random"}:${launch.examType}:${launch.examGroupId || ""}:${launch.redo ? `${launch.redo.kind}:${launch.redo.dateFlag}:${launch.redo.sort}` : ""}`;
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
  function answerPayload(item: R, skip = false) {
    const itemId = String(item.exerciseId || item.id);
    return buildComputerAnswer({
      question: item,
      answer: answers[itemId] || "",
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
  async function submit(skip = false, all = false) {
    setError("");
    if (
      all &&
      questions.some(
        (q) =>
          !answers[String(q.exerciseId || q.id)] &&
          !ai[String(q.exerciseId || q.id)],
      ) &&
      !window.confirm("还有未作答的题目，确认交卷？")
    )
      return;
    if (!skip && !all && !answer.trim() && !ai[id]) {
      setError("请先选择或填写答案。");
      return;
    }
    setLoading(true);
    try {
      const selected = all ? questions : [question];
      if (!selected.length) throw new Error("请先完成至少一道题。");
      const payload = buildComputerSubmission({
        answers: selected.map(
          (q) =>
            submitted[String(q.exerciseId || q.id)] || answerPayload(q, skip),
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
          answer,
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
      setNotice(
        all ? "试卷已提交，学习记录已同步。" : "答案已保存至计算机学习记录。",
      );
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
        setFinalReport({
          examRecord: {
            ...payload,
            id: result?.examRecordId || launch.data.examRecordId,
            aiScoreStatus: result?.aiScoreStatus ?? 1,
          },
          answerList: payload.answers.map((a) => ({
            ...a,
            exercise: questions.find(
              (q) => String(q.exerciseId) === String(a.exerciseId),
            ),
          })),
          examination: { examinationName: launch.title },
        });
        localStorage.removeItem(storageKey);
      }
      questionStarted.current = Date.now();
      if (result?.score != null) setNotice(`已提交，得分 ${result.score}。`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function move(index: number) {
    if (index < 0 || index >= total) return;
    setError("");
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
    <section className="computer-session panel">
      <div className="computer-session-top">
        <button className="computer-back" onClick={onClose}>
          <ArrowLeft size={18} />
          返回
        </button>
        <span>{launch.title}</span>
        <button
          className="btn btn-secondary"
          onClick={() => setShowSheet(!showSheet)}
        >
          答题卡 {current + 1}/{total}
        </button>
      </div>
      <div className="computer-progress">
        <span style={{ width: `${((current + 1) / total) * 100}%` }} />
      </div>
      {showSheet && (
        <div className="computer-sheet">
          {Array.from({ length: total }, (_, i) => (
            <button
              className={`${i === current ? "active" : ""} ${submitted[String(questions[i]?.exerciseId || launch.data.examExerciseIdList?.[i])] || skipped.includes(String(questions[i]?.exerciseId || launch.data.examExerciseIdList?.[i])) ? "answered" : ""}`}
              key={i}
              onClick={() => void move(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
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
        />
      )}
      <RichContent
        content={String(
          question.exerciseStems || question.stem || question.title || "",
        ).replace(/\$\*\$(\d+)\$\*\$/g, " （$1）________ ")}
        className="computer-question-stem"
      />
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
                option.questionStem || String.fromCharCode(65 + index),
              ),
              selected =
                type === 2 ? answer.split(",").includes(key) : answer === key;
            return (
              <button
                key={index}
                className={`computer-option ${selected ? "active" : ""} ${hasSubmitted && String(question.exerciseAnswer).split(",").includes(key) ? "correct" : ""}`}
                disabled={hasSubmitted || loading}
                onClick={() =>
                  setAnswer(
                    type === 2
                      ? (selected
                          ? answer.split(",").filter((k) => k !== key)
                          : [...answer.split(",").filter(Boolean), key]
                        )
                          .sort()
                          .join(",")
                      : key,
                  )
                }
              >
                <span className="computer-option-key">{key}</span>
                <RichContent
                  content={option.questionAnswer || option.content}
                />
                {selected && <Check size={17} />}
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
      {(hasSubmitted || finished) && (
        <div className="computer-analysis">
          <h3>答案与解析</h3>
          {skipped.includes(id) && <p className="computer-dim">本题已跳过，未计为实际作答。</p>}
          {launch.voice && safeLink(answer.split("$-$")[0]) && (
            <audio controls src={safeLink(answer.split("$-$")[0])} />
          )}
          <p>
            参考答案：
            <strong>{plain(question.exerciseAnswer) || "见下方解析"}</strong>
          </p>
          <RichContent
            content={
              question.exerciseAnalysis ||
              question.exerciseAnalyze ||
              question.analysis ||
              question.exerciseResolve ||
              ""
            }
          />
          {question.videoUrl && safeLink(question.videoUrl) && (
            <a
              href={safeLink(question.videoUrl)}
              target="_blank"
              rel="noreferrer"
            >
              查看题目视频
            </a>
          )}
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
          {question.exerciseProperty?.knowledgeTags && (
            <p className="computer-dim">
              知识点：{String(question.exerciseProperty.knowledgeTags)}
            </p>
          )}
        </div>
      )}
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
        {!hasSubmitted && !isReadOnly && (
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
            <button
              className="btn btn-primary"
              disabled={loading}
              onClick={() => void submit()}
            >
              提交答案
            </button>
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
        {!isReadOnly && !finished && !isSequential && (
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
        examId={String(examId || "")}
        index={current}
        examCategory={category}
        source={computerFeedbackSource(launch)}
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
    </section>
  );
}
