import { useSession } from "../../lib/session";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import MathQuestionTools from "./MathQuestionTools";
import MathQuestionVideo from "./MathQuestionVideo";
import RichContent from "../RichContent";
import MathAnalysisContent from "./MathAnalysisContent";
import { answerProgress } from "../learning/answer-progress.mjs";
import "../learning/answer-progress.css";
import { mathOptionFeedback } from "./math-question-presentation.mjs";
import "./math-choice-feedback.css";
import { mathData } from "../../platforms/math";
import { recordActivity } from "../../lib/store";
import {
  computingApi,
  computingCorrect,
  computingHintRecord,
  computingPaperRecord,
  computingRecord,
  computingRows,
  computingTree,
  computingAnswers,
} from "./math-computing";
import type { ComputingContext, ComputingRow as R } from "./math-computing";
import "./math-computing.css";

function useComputing(key: string, loader: () => Promise<any>) {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
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
  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
}
function Status({
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
      <div className="computing-status" role="status">
        <LoaderCircle size={22} className="spin" />
        正在读取计算大题…
      </div>
    );
  if (error)
    return (
      <div className="computing-error" role="alert">
        <p>{error}</p>
        {reload && (
          <button className="btn btn-secondary" onClick={reload}>
            重试
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="empty-state">
        <BookOpen size={28} />
        <h3>暂无计算学习内容</h3>
        <p>当前账号在这个分类下还没有可用内容。</p>
      </div>
    );
  return null;
}
function safeUrl(value: any) {
  try {
    const url = new URL(String(value).replaceAll(".png_yjs", ".png"));
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ComputingPaper({
  context,
  onClose,
}: {
  context: ComputingContext;
  onClose: () => void;
}) {
  const { session } = useSession();
  const loaded = useComputing(JSON.stringify(context), () =>
      computingApi.paper(context),
    ),
    [questions, setQuestions] = useState<R[]>([]),
    [paperRecord, setPaperRecord] = useState<R | null>(null),
    [current, setCurrent] = useState(0),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [finished, setFinished] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [sheet, setSheet] = useState(false),
    [seconds, setSeconds] = useState(0),
    [ready, setReady] = useState(false);
  const questionAt = useRef(Date.now()),
    started = useRef(Date.now()),
    draftKey = `study:math:computing:${session.user?.id || "guest"}:${context.stuid}:${context.catalogID}:${context.PaperID}:${context.mistakes ? "review" : "practice"}`,
    question = questions[current] || {},
    id = String(question.QuestionID || ""),
    answer = answers[id] || "",
    correct = computingCorrect(question, answer),
    record = question.record,
    steps = question.steps || [];
  useEffect(() => {
    if (!loaded.data) return;
    const rows = loaded.data.questions as R[];
    setQuestions(rows);
    setPaperRecord(loaded.data.record);
    setFinished(Number(loaded.data.record?.IsFinished) === 1);
    const initial = Object.fromEntries(
      rows.map((q) => [String(q.QuestionID), q.record?.Answer || ""]),
    );
    let index = context.questionID
      ? rows.findIndex(
          (q) => String(q.QuestionID) === String(context.questionID),
        )
      : rows.findIndex((q) => !q.record || Number(q.record.AnswerState) !== 1);
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (draft && Number(loaded.data.record?.IsFinished) !== 1) {
        Object.assign(initial, draft.answers);
        index = draft.current ?? index;
        started.current = draft.started || Date.now();
      }
    } catch {}
    setAnswers(initial);
    setCurrent(Math.min(rows.length - 1, Math.max(0, index)));
    setReady(true);
  }, [loaded.data]);
  useEffect(() => {
    if (ready && !finished)
      localStorage.setItem(
        draftKey,
        JSON.stringify({ answers, current, started: started.current }),
      );
  }, [answers, current, finished, ready, draftKey]);
  useEffect(() => {
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - questionAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [current]);
  useEffect(() => {
    setNotice("");
    questionAt.current = Date.now();
    setSeconds(0);
  }, [current, question.QuestionID]);
  function move(index: number) {
    if (index >= 0 && index < questions.length) {
      setQuestions((rows) =>
        rows.map((q, i) =>
          i === current
            ? { ...q, questiontime: Number(q.questiontime || 0) + seconds }
            : q,
        ),
      );
      setCurrent(index);
      setSheet(false);
      setError("");
    }
  }
  async function submit() {
    if (!answer) {
      setError("请选择答案后提交。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = computingRecord(
          context,
          question,
          answer,
          Number(record?.Notes || 0) +
            Number(question.questiontime || 0) +
            seconds,
        ),
        response = await computingApi.save(payload),
        newId = payload.ID || mathData(response);
      if (
        !payload.ID &&
        (typeof newId === "number" || typeof newId === "string")
      )
        payload.ID = newId;
      setQuestions((rows) =>
        rows.map((q, i) =>
          i === current ? { ...q, record: payload, questiontime: 0 } : q,
        ),
      );
      setNotice(
        correct
          ? context.mistakes
            ? "已掌握，这道题已从待复习错题中移除。"
            : "回答正确，学习记录已同步。"
          : "继续查看分步提示，再试一次。",
      );
      questionAt.current = Date.now();
      setSeconds(0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function hint(step: R, state: number) {
    setLoading(true);
    setError("");
    try {
      const payload = computingHintRecord(context, question, step, state),
        response = await computingApi.save(payload);
      payload.ID = payload.ID || mathData(response);
      setQuestions((rows) =>
        rows.map((q, i) =>
          i === current
            ? {
                ...q,
                steps: q.steps.map((s: R) =>
                  s.ID === step.ID ? { ...s, looklog: payload } : s,
                ),
              }
            : q,
        ),
      );
      setNotice("提示反馈已保存");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function finish() {
    setLoading(true);
    setError("");
    try {
      await computingApi.finish(context, questions, paperRecord);
      setFinished(true);
      setSheet(true);
      localStorage.removeItem(draftKey);
      recordActivity({
        platform: "math",
        type: "computing",
        title: loaded.data?.meta?.Name || "计算大题练习",
        total: questions.length,
        correct: questions.filter((q) => Number(q.record?.AnswerState) === 1)
          .length,
        durationSeconds: Math.round((Date.now() - started.current) / 1000),
        path: "/study/practice",
      });
      setNotice("计算卷已提交，学习记录已同步");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="panel computing-paper">
      <div className="computing-paper-top">
        <button className="computing-back" onClick={onClose}>
          <ArrowLeft size={16} />
          返回目录
        </button>
        <strong>
          {loaded.data?.meta?.Name ||
            (context.mistakes ? "错题反复练" : "计算大题")}
        </strong>
        <span className="computing-time">
          <Clock3 size={15} />
          {clock(seconds)}
        </span>
        <button className="btn btn-secondary" onClick={() => setSheet(!sheet)}>
          答题卡 {current + 1}/{questions.length}
        </button>
      </div>
      <Status
        loading={loaded.loading}
        error={loaded.error}
        empty={!loaded.loading && !loaded.error && !questions.length}
        reload={loaded.reload}
      />
      {!loaded.loading && !loaded.error && questions.length > 0 && (
        <>
          {finished && (
            <div className="computing-report">
              <h3>计算卷学习报告</h3>
              <div>
                <span>
                  总题数 <strong>{questions.length}</strong>
                </span>
                <span>
                  答对{" "}
                  <strong>
                    {
                      questions.filter(
                        (q) => Number(q.record?.AnswerState) === 1,
                      ).length
                    }
                  </strong>
                </span>
                <span>
                  正确率{" "}
                  <strong>
                    {Math.round(
                      (questions.filter(
                        (q) => Number(q.record?.AnswerState) === 1,
                      ).length /
                        questions.length) *
                        100,
                    )}
                    %
                  </strong>
                </span>
              </div>
              <p>继续回看题目、提示和解析，巩固计算方法。</p>
            </div>
          )}
          {sheet && (
            <div className="computing-sheet">
              {questions.map((q, i) => {
                const answered = !!q.record && (context.mistakes || !!q.record.Answer || Number(q.record.AnswerState) === 1),
                  progress = answerProgress({ saved: answered, draft: !!answers[String(q.QuestionID)], correct: answered && Number(q.record.AnswerState) === 1 ? true : answered && Number(q.record.AnswerState) === 0 ? false : undefined });
                return (
                <button
                  key={i}
                  className={`${current === i ? "active" : ""} answer-progress-${progress.state}`}
                  aria-label={`第 ${i + 1} 题，${progress.label}`}
                  aria-current={current === i ? "step" : undefined}
                  title={progress.label}
                  onClick={() => move(i)}
                >
                  {i + 1}
                </button>
              ); })}
            </div>
          )}
          <div className="computing-question-title">
            <span className="computing-tag">第 {current + 1} 题</span>
            <span>
              {computingAnswers(question.options || []).length > 1
                ? "多选题"
                : "单选题"}
            </span>
            {record && (
              <span
                className={
                  Number(record.AnswerState) === 1
                    ? "computing-correct"
                    : "computing-muted"
                }
              >
                {Number(record.AnswerState) === 1 ? "已答对" : "继续练习"} ·
                尝试 {record.BusValue || 1} 次
              </span>
            )}
          </div>
          {question.stems?.length ? (
            question.stems.map((r: R, i: number) => (
              <RichContent key={i} content={r.Content} />
            ))
          ) : (
            <RichContent
              content={
                question._question_list?.QuestionTxt ||
                question._question_list?.Content ||
                question.QuestionTxt
              }
            />
          )}
          <div className="computing-options">
            {(question.options || []).map((option: R, i: number) => {
              const selected = answer.split(",").includes(String(option.ID)),
                multiple = computingAnswers(question.options).length > 1,
                feedback = mathOptionFeedback(option, question.options || [], selected, finished || (!!record && String(record.Answer ?? "") === answer));
              return (
                <button
                  key={option.ID || i}
                  className={`computing-option ${selected ? "active" : ""} ${feedback}`}
                  disabled={
                    loading || finished || (context.mistakes && !!record)
                  }
                  onClick={() =>
                    setAnswers((a) => ({
                      ...a,
                      [id]: multiple
                        ? (selected
                            ? answer
                                .split(",")
                                .filter((v) => v !== String(option.ID))
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
                  <RichContent content={option.Content} />
                  {feedback === "math-choice-incorrect" ? <X size={19} aria-label="回答错误" /> : feedback === "math-choice-correct" && <Check size={19} aria-label="正确答案" />}
                </button>
              );
            })}
          </div>
          {(
            <div className="computing-hints">
              <h3>
                <Lightbulb size={18} />
                分步提示与反馈
              </h3>
              {steps.map((step: R, i: number) => (
                  <div className="computing-step" key={step.ID || i}>
                    <strong>提示 {i + 1}</strong>
                    <RichContent content={step.Content} />
                    {step.Files &&
                      (safeUrl(step.Files) ? (
                        <a
                          href={safeUrl(step.Files)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          查看提示视频
                        </a>
                      ) : (
                        <MathQuestionVideo
                          row={{
                            PolyvVID: step.Files,
                            Title: `提示 ${i + 1} 视频`,
                          }}
                        />
                      ))}
                    <div className="computing-toolbar">
                      <span className="computing-muted">
                        这一步对你有帮助吗？
                      </span>
                      <button
                        className={`btn btn-secondary ${step.looklog?.AnswerState === 1 ? "selected" : ""}`}
                        disabled={loading}
                        onClick={() => void hint(step, 1)}
                      >
                        已理解
                      </button>
                      <button
                        className={`btn btn-secondary ${step.looklog?.AnswerState === 0 ? "selected" : ""}`}
                        disabled={loading}
                        onClick={() => void hint(step, 0)}
                      >
                        还需巩固
                      </button>
                    </div>
                  </div>
                ))}
              {(
                <div className="computing-analysis">
                  <h4>完整解析</h4>
                  {(question.analyses || []).map((a: R, i: number) => (
                    <MathAnalysisContent key={i} content={a.Context || a.Content} />
                  ))}
                  <p>
                    参考选项：
                    {(question.options || [])
                      .filter((o: R) => Number(o.IsAnswer) === 1)
                      .map((o: R) =>
                        String.fromCharCode(65 + question.options.indexOf(o)),
                      )
                      .join("、")}
                  </p>
                </div>
              )}
            </div>
          )}
          <Status loading={loading} error={error} />
          {notice && (
            <p className="computing-notice" role="status">
              {notice}
            </p>
          )}
          <div className="computing-actions">
            <button
              className="btn btn-secondary"
              disabled={!current || loading}
              onClick={() => move(current - 1)}
            >
              <ArrowLeft size={15} />
              上一题
            </button>
            {!finished && !(context.mistakes && record) && (
              <button
                className="btn btn-primary"
                disabled={loading}
                onClick={() => void submit()}
              >
                提交答案
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
            {!finished && !context.mistakes && (
              <button
                className="btn btn-primary"
                disabled={loading}
                onClick={() => {
                  if (window.confirm("确认提交本卷？未作答题目会记录为未答。"))
                    void finish();
                }}
              >
                提交计算卷
              </button>
            )}
          </div>
          <MathQuestionTools
            key={id}
            stuid={context.stuid}
            qid={question.QuestionID}
            bookId={Number(question._question_list?.BookID || 0)}
            question={question._question_list || question}
            source="选择题库"
            isCourse={false}
          />
        </>
      )}
    </div>
  );
}

function ComputingInfo({
  catalog,
  stuid,
  onClose,
  onStart,
}: {
  catalog: R;
  stuid: string;
  onClose: () => void;
  onStart: (context: ComputingContext) => void;
}) {
  const info = useComputing(`info-${catalog.ID}`, () =>
      computingApi.info(catalog.ID),
    ),
    detail = computingRows(info.data)[0] || catalog,
    context: ComputingContext = {
      stuid,
      catalogID: detail.ID,
      PaperID: detail.BusID,
    },
    logs = useComputing(`records-${stuid}-${detail.ID}-${detail.BusID}`, () =>
      detail.BusID
        ? computingApi.records(context)
        : Promise.resolve({ data: [] }),
    ),
    record = computingRows(logs.data).find(
      (r) => Number(r.QuestionID) === 0 && r.BusType === "试卷",
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function begin(retry = false) {
    setLoading(true);
    setError("");
    try {
      if (!detail.BusID) throw new Error("当前目录尚未配置计算卷。");
      if (retry) await computingApi.retry(context);
      if (!record || retry)
        await computingApi.save(computingPaperRecord(context, false));
      onStart(context);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="panel">
      <button className="computing-back" onClick={onClose}>
        <ArrowLeft size={16} />
        计算目录
      </button>
      <Status
        loading={info.loading || logs.loading}
        error={info.error || logs.error}
        reload={info.reload}
      />
      <span className="computing-tag">四大计算</span>
      <h2>{detail.Title || detail.Name || "计算专题"}</h2>
      <RichContent
        content={detail.Json || detail.Content || detail.Description}
      />
      {[
        ...String(detail.IntroImg || "").split(";"),
        ...String(detail.Notes || "").split(";"),
      ].map(
        (url, i) =>
          safeUrl(url) && (
            <img
              className="computing-intro-image"
              key={i}
              src={safeUrl(url)}
              alt="计算专题介绍"
            />
          ),
      )}
      <Status loading={loading} error={error} />
      <div className="computing-actions">
        <button
          className="btn btn-primary"
          disabled={loading}
          onClick={() => void begin()}
        >
          {Number(record?.IsFinished) === 1
            ? "查看学习报告"
            : record
              ? "继续练习"
              : "开始练习"}
          <ArrowRight size={16} />
        </button>
        {record && Number(record.IsFinished) === 1 && (
          <button
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => {
              if (window.confirm("重新练习会重置本卷已有作答，确认继续？"))
                void begin(true);
            }}
          >
            <RotateCcw size={16} />
            再练一遍
          </button>
        )}
      </div>
    </div>
  );
}

export default function MathComputing({ stuid }: { stuid: string }) {
  const [tab, setTab] = useState("catalog"),
    [catalog, setCatalog] = useState<R | null>(null),
    [paper, setPaper] = useState<ComputingContext | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const remote = useComputing(`computing-${stuid}`, async () => {
      const [catalogs, last, count, errors] = await Promise.all([
        computingApi.catalogs(stuid),
        computingApi.lastLog(stuid),
        computingApi.errorCount(stuid),
        computingApi.errors(stuid),
      ]);
      return { catalogs, last, count, errors };
    }),
    tree = computingTree(computingRows(remote.data?.catalogs)),
    errors = computingRows(remote.data?.errors),
    last = computingRows(remote.data?.last)[0],
    errorCount = Number(
      computingRows(remote.data?.count)[0]?.counts || errors.length,
    );
  async function remove(item: R) {
    setLoading(true);
    setError("");
    try {
      await computingApi.save({
        ID: item.ID,
        IsFinished: 1,
        UpdateColumns: "IsFinished",
      });
      remote.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  if (paper)
    return (
      <ComputingPaper
        context={paper}
        onClose={() => {
          setPaper(null);
          remote.reload();
        }}
      />
    );
  if (catalog)
    return (
      <ComputingInfo
        catalog={catalog}
        stuid={stuid}
        onClose={() => setCatalog(null)}
        onStart={setPaper}
      />
    );
  return (
    <div className="math-computing">
      <div className="panel">
        <div className="computing-toolbar">
          <div className="tabs">
            <button
              className={tab === "catalog" ? "active" : ""}
              onClick={() => setTab("catalog")}
            >
              专题目录
            </button>
            <button
              className={tab === "errors" ? "active" : ""}
              onClick={() => setTab("errors")}
            >
              错题反复练
            </button>
          </div>
          <span className="math-muted">{errorCount} 道待复习</span>
          <input
            className="input"
            aria-label="搜索计算专题"
            placeholder="搜索当前专题或错题"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={remote.reload}>
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
        <Status
          loading={remote.loading || loading}
          error={remote.error || error}
          empty={
            !remote.loading &&
            !remote.error &&
            !(tab === "catalog" ? tree.length : errors.length)
          }
          reload={remote.reload}
        />
        {tab === "catalog"
          ? tree
              .filter(
                (parent) =>
                  !search ||
                  [
                    parent.Title,
                    parent.Name,
                    ...(parent.children || []).map((c: R) => c.Title || c.Name),
                  ]
                    .join(" ")
                    .includes(search),
              )
              .map((parent, i) => (
                <details
                  className="computing-topic"
                  key={parent.ID || i}
                  open={i === 0}
                >
                  <summary>
                    <span className="computing-topic-icon">
                      <BookOpen size={19} />
                    </span>
                    <div>
                      <strong>{parent.Title || parent.Name}</strong>
                      <span>{parent.children?.length || 0} 个计算专题</span>
                    </div>
                  </summary>
                  <button
                    className="computing-intro-button"
                    onClick={() => {
                      setCatalog(parent);
                    }}
                  >
                    专题介绍
                    <ChevronRight size={14} />
                  </button>
                  {(parent.children || []).map((child: R, index: number) => (
                    <button
                      className="computing-catalog-row"
                      key={child.ID || index}
                      onClick={() => {
                        setCatalog(child);
                      }}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{child.Title || child.Name}</strong>
                        {String(last?.BusID) === String(child.ID) && (
                          <small>上次学到这里</small>
                        )}
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </details>
              ))
          : errors
              .filter(
                (item) =>
                  !search ||
                  String(item.Content || item.QuestionTxt || "").includes(
                    search,
                  ),
              )
              .map((item, i) => (
                <div className="computing-error-row" key={item.ID || i}>
                  <div>
                    <span className="computing-tag">待复习</span>
                    <RichContent
                      content={
                        item.Content ||
                        item.QuestionTxt ||
                        `第 ${item.QuestionID} 题`
                      }
                    />
                  </div>
                  <button
                    className="btn btn-secondary"
                    disabled={loading}
                    onClick={() => {
                      if (
                        window.confirm(
                          "确认已掌握这道题，并从待复习错题中移除？",
                        )
                      )
                        void remove(item);
                    }}
                  >
                    标为已掌握
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      setPaper({
                        stuid,
                        catalogID: item.BusID,
                        PaperID: item.PaperID,
                        mistakes: true,
                        questionID: item.QuestionID,
                      })
                    }
                  >
                    重练
                    <ArrowRight size={15} />
                  </button>
                </div>
              ))}
      </div>
    </div>
  );
}
