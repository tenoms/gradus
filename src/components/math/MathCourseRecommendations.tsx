import { useSession } from "../../lib/session";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  FileText,
  LoaderCircle,
  Play,
  Printer,
  RefreshCw,
} from "lucide-react";
import RichContent from "../RichContent";
import LearningVideo from "../LearningVideo";
import MathQuestionReader from "./MathQuestionReader";
import MathQuestionVideo from "./MathQuestionVideo";
import { mathRows } from "../../platforms/math";
import { recordStudy } from "../../lib/store";
import { reportFileLinks } from "./report-model.mjs";
import { recommendationApi } from "./math-course-recommendations";
import type {
  RecommendationContext,
  RecommendationRow as R,
} from "./math-course-recommendations";
import {
  buildRecommendationRecord,
  recommendationCanAddTopic,
  recommendationGroups,
  recommendationMetadata,
  recommendationOptions,
  recommendationRecordComplete,
  recommendationPrintUrl,
  recommendationUpdate,
} from "./course-recommendations-model.mjs";
import "./math-course-recommendations.css";

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
    <div className="mcr-status" role="status">
      <LoaderCircle size={18} className="spin" />
      正在读取个性练习…
    </div>
  ) : error ? (
    <div className="mcr-error" role="alert">
      <span>{error}</span>
      {retry && (
        <button className="btn btn-secondary" onClick={retry}>
          <RefreshCw size={14} />
          重试
        </button>
      )}
    </div>
  ) : empty ? (
    <div className="empty-state">
      <Check size={28} />
      <h3>当前没有待突破的专题</h3>
      <p>已生成的题组会显示在这里。可以返回课程继续下一项学习任务。</p>
    </div>
  ) : null;
}
function questionId(question: R) {
  return String(question.QuestionID || question.ID || "");
}
function questionName(question: R, index: number) {
  return (
    question._question_list?.QuestionName ||
    `第 ${question.QuestionSort || question.Sort || index + 1} 题`
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

function SpecialVideos({
  LinkSort,
  onClose,
}: {
  LinkSort: string | number;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<R[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [active, setActive] = useState(0),
    watched = useRef(new Set<number>());
  useEffect(() => {
    let valid = true;
    setLoading(true);
    recommendationApi
      .videos(LinkSort)
      .then((d) => {
        if (valid) setRows(mathRows(d));
      })
      .catch((e) => {
        if (valid) setError(e.message);
      })
      .finally(() => {
        if (valid) setLoading(false);
      });
    return () => {
      valid = false;
    };
  }, [LinkSort]);
  const video = rows[active],
    url = video?.VideoUrl;
  return (
    <section className="panel mcr-video">
      <button className="mcr-back" onClick={onClose}>
        <ArrowLeft size={15} />
        返回题组
      </button>
      <h3>专题视频学习</h3>
      <Status
        loading={loading}
        error={error}
        empty={!loading && !error && !rows.length}
      />
      {video && (
        <>
          <div className="mcr-video-tabs">
            {rows.map((row, i) => (
              <button
                className={`btn ${active === i ? "btn-primary" : "btn-secondary"}`}
                key={row.ID || i}
                onClick={() => setActive(i)}
              >
                {row.Name || row.PlovyName || `视频 ${i + 1}`}
              </button>
            ))}
          </div>
          {safeUrl(url) ? (
            <LearningVideo
              key={active}
              src={safeUrl(url)!}
              controls
              onTimeUpdate={(e) => {
                if (
                  e.currentTarget.currentTime > 0 &&
                  !watched.current.has(active)
                ) {
                  watched.current.add(active);
                  recordStudy({
                    platform: "math",
                    type: "video",
                    title: video.Name || "推荐专题视频",
                    path: "/study/courses",
                  });
                }
              }}
            />
          ) : (
            <MathQuestionVideo
              key={active}
              row={{
                ...video,
                PolyvVID: url,
                Title: video.Name || video.PlovyName || "播放专题视频",
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

export default function MathCourseRecommendations({
  stuid,
  PaperID,
  CourseID,
  CalendarID,
  ProductID,
  isSuper = false,
  onClose,
}: {
  stuid: string;
  PaperID: string | number;
  CourseID: string | number;
  CalendarID: string | number;
  ProductID: string | number;
  isSuper?: boolean;
  onClose?: () => void;
}) {
  const { session } = useSession();
  const context: RecommendationContext = {
      stuid,
      PaperID,
      CourseID,
      CalendarID,
      ProductID,
      isSuper,
    },
    key = JSON.stringify(context),
    draftKey = `study:math:recommendations:${session.user?.id || "guest"}:${stuid}:${PaperID}:${CalendarID}:${ProductID}`;
  const [meta, setMeta] = useState<R>({}),
    [rows, setRows] = useState<R[]>([]),
    [details, setDetails] = useState<{ info: any; original: R[] }>({
      info: {},
      original: [],
    }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [detailError, setDetailError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0),
    [active, setActive] = useState(""),
    [index, setIndex] = useState(0),
    [view, setView] = useState<"list" | "question" | "report">("list"),
    [review, setReview] = useState(false),
    [encore, setEncore] = useState(false),
    [attemptSaved, setAttemptSaved] = useState<string[]>([]),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [revealed, setRevealed] = useState(false),
    [showSheet, setShowSheet] = useState(false),
    [showTopics, setShowTopics] = useState(false),
    [selectedTopic, setSelectedTopic] = useState(""),
    [videos, setVideos] = useState<string | number | null>(null),
    [draftReady, setDraftReady] = useState(false);
  const completionSaved = useRef(false),
    attempt = useRef(0);
  const rawGroups = recommendationGroups(rows, isSuper),
    decorated = recommendationMetadata(
      rawGroups,
      details.info,
      details.original,
      isSuper,
    ),
    groups = decorated.groups,
    group = groups.find((g) => String(g.LinkSort) === active),
    questions: R[] = group?.data || [],
    question = questions[index] || {},
    qid = questionId(question),
    options = recommendationOptions(question),
    saved =
      recommendationRecordComplete(question) &&
      (!encore || attemptSaved.includes(qid)),
    answer =
      answers[qid] ?? String(question._c_course_users_record?.Answer || ""),
    cap = recommendationCanAddTopic(groups),
    allComplete = groups.length > 0 && groups.every((g) => g.isFinish),
    title = String(meta.Name || "个性推荐练习").replace(
      /_智推练习/g,
      " · 查漏补缺练习",
    );
  useEffect(() => {
    let valid = true;
    setLoading(true);
    setError("");
    setDetailError("");
    setDraftReady(false);
    setRows([]);
    completionSaved.current = false;
    recommendationApi
      .load(context)
      .then(async (data) => {
        if (!valid) return;
        setMeta(data.meta);
        setRows(data.questions);
        const initial: Record<string, string> = {};
        for (const row of data.questions)
          if (row._c_course_users_record?.Answer)
            initial[questionId(row)] = String(
              row._c_course_users_record.Answer,
            );
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
          if (draft) {
            Object.assign(initial, draft.answers || {});
            if (
              data.questions.some(
                (q) => String(q.LinkSort) === String(draft.active),
              )
            ) {
              setActive(String(draft.active));
              setIndex(Math.max(0, Number(draft.index) || 0));
            }
          }
        } catch {}
        setAnswers(initial);
        setDraftReady(true);
        setLoading(false);
        try {
          const detail = await recommendationApi.details(context, data.meta);
          if (valid) setDetails(detail);
        } catch (e: any) {
          if (valid) setDetailError(e.message);
        }
      })
      .catch((e) => {
        if (valid) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      valid = false;
    };
  }, [key, version]);
  useEffect(() => {
    if (draftReady)
      localStorage.setItem(
        draftKey,
        JSON.stringify({ answers, active, index }),
      );
  }, [draftReady, draftKey, answers, active, index]);
  function openGroup(next: R, mode: "list" | "question" | "report" = "list") {
    setActive(String(next.LinkSort));
    setIndex(0);
    setView(mode);
    setReview(false);
    setEncore(false);
    setAttemptSaved([]);
    setRevealed(false);
    setError("");
    setNotice("");
  }
  function move(next: number) {
    if (next < 0 || next >= questions.length) return;
    setIndex(next);
    setRevealed(review);
    setShowSheet(false);
    setError("");
    setNotice("");
  }
  function redo() {
    if (!group) return;
    attempt.current++;
    setEncore(true);
    setReview(false);
    setAttemptSaved([]);
    setView("question");
    setIndex(0);
    setRevealed(false);
    setAnswers((previous) => {
      const next = { ...previous };
      for (const q of questions) next[questionId(q)] = "";
      return next;
    });
  }
  async function complete(nextRows: R[]) {
    if (encore || completionSaved.current) return;
    const nextGroups = recommendationGroups(nextRows, isSuper);
    if (!nextGroups.length || !nextGroups.every((g) => g.isFinish)) return;
    const result = await recommendationApi.complete(context);
    completionSaved.current = true;
    if (result.warning)
      setNotice(`全部题组已保存，下一任务更新提示：${result.warning}`);
    else setNotice("全部题组已完成，下一学习任务已解锁。");
  }
  async function save(
    correct = 0,
    givenAnswer = answer,
    givenOptions = options,
  ) {
    if (review || saved || !qid) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (givenOptions.length && !givenAnswer)
        throw new Error("请先选择答案。");
      if (!givenOptions.length && !revealed)
        throw new Error("请先查看解析，再记录掌握情况。");
      const payload = buildRecommendationRecord(
          context,
          { ...question, options: givenOptions },
          givenAnswer,
          correct,
        ),
        record = await recommendationApi.save(payload);
      let next: R[];
      if (Number(record.ID) > 0) next = recommendationUpdate(rows, qid, record);
      else next = mathRows(await recommendationApi.questions(context));
      setRows(next);
      setAttemptSaved((ids) => [...new Set([...ids, qid])]);
      setRevealed(true);
      setAnswers((a) => ({ ...a, [qid]: givenAnswer }));
      setNotice(
        Number(record.AnswerState) === 1
          ? "掌握情况已保存"
          : "已保存，建议继续巩固本题",
      );
      try {
        await complete(next);
      } catch (e: any) {
        setNotice(
          `本题已保存，课程完成状态尚未同步：${e.message}。可再次点击本组学习报告重试。`,
        );
      }
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function finishGroup() {
    setBusy(true);
    setError("");
    try {
      if (
        questions.some(
          (q) =>
            !recommendationRecordComplete(q) ||
            (encore && !attemptSaved.includes(questionId(q))),
        )
      )
        throw new Error("请核对并保存本组每道题后再查看本轮报告。");
      await complete(rows);
      setView("report");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function append(Links: string | number) {
    if (!window.confirm("高质量完成已推题目即可。确认继续追加这一专题的题目？"))
      return;
    setBusy(true);
    setError("");
    try {
      await recommendationApi.append(context, meta, Links);
      setShowTopics(false);
      setSelectedTopic("");
      completionSaved.current = false;
      setNotice("已追加推荐题目，正在同步题组。");
      setView("list");
      setVersion((v) => v + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("资料地址已复制");
    } catch {
      setError("复制失败，可打开资料后复制浏览器地址。");
    }
  }
  function materials(group: R) {
    const links = reportFileLinks({
      Files: group.Files,
      AnswerFiles: group.AnswerFiles,
      SpecialFiles: group.SpecialFiles,
    });
    return (
      <div className="mcr-materials">
        {links.map((file) => (
          <span key={file.url}>
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              <FileText size={14} />
              {file.label}
            </a>
            <button
              className="mcr-icon"
              aria-label={`复制${file.label}地址`}
              onClick={() => void copy(file.url)}
            >
              <Copy size={14} />
            </button>
          </span>
        ))}
        <a
          className="btn btn-secondary"
          href={recommendationPrintUrl(context, group)}
          target="_blank"
          rel="noreferrer"
        >
          <Printer size={14} />
          题目打印与下载
        </a>
        <button
          className="btn btn-secondary"
          onClick={() => setVideos(group.LinkSort)}
        >
          <Play size={14} />
          专题视频
        </button>
      </div>
    );
  }
  if (videos !== null)
    return <SpecialVideos LinkSort={videos} onClose={() => setVideos(null)} />;
  return (
    <div className="math-course-recommendations">
      <div className="panel mcr-heading">
        <div>
          {onClose && (
            <button className="mcr-back" onClick={onClose}>
              <ArrowLeft size={15} />
              返回课程
            </button>
          )}
          <span className="mcr-eyebrow">PERSONAL PRACTICE</span>
          <h2>{title}</h2>
          <p>按薄弱考点逐组突破，独立作答后核对解析，记录真实掌握情况。</p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={loading || busy}
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={15} />
          刷新
        </button>
      </div>
      <Status
        loading={loading}
        error={error}
        retry={() => setVersion((v) => v + 1)}
      />
      {notice && (
        <p className="mcr-notice" role="status">
          {notice}
        </p>
      )}
      {detailError && (
        <p className="mcr-error" role="alert">
          专题资料暂未读取：{detailError}
          <button
            className="btn btn-secondary"
            onClick={() => setVersion((v) => v + 1)}
          >
            重新读取
          </button>
        </p>
      )}
      {!loading && !error && !groups.length && (
        <div className="panel">
          <Status empty />
        </div>
      )}
      {!loading && groups.length > 0 && (!group || view === "list") && (
        <>
          <div className="mcr-groups">
            {groups.map((next) => (
              <article className="panel mcr-group" key={next.LinkSort}>
                <div className="mcr-group-title">
                  <span className="mcr-topic-icon">
                    <FileText size={22} />
                  </span>
                  <div>
                    <h3>{next.AddPerson}</h3>
                    <p>
                      {next.data.length} 题 · 已核对 {next.count} 题 · 掌握{" "}
                      {next.correct} 题
                      {next.newCount ? ` · 新增 ${next.newCount} 题` : ""}
                    </p>
                  </div>
                  <span
                    className={`mcr-pill ${next.isFinish ? "complete" : ""}`}
                  >
                    {next.isFinish ? "已完成" : "待突破"}
                  </span>
                </div>
                {(next.ND || next.KP) && (
                  <p className="mcr-muted">
                    难度 {next.ND || "—"} · 考频 {next.KP || "—"}
                  </p>
                )}
                <div className="mcr-progress">
                  <i
                    style={{
                      width: `${(next.count / next.data.length) * 100}%`,
                    }}
                  />
                </div>
                {materials(next)}
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    openGroup(next, next.isFinish ? "report" : "question")
                  }
                >
                  {next.isFinish ? "查看报告" : "开始突破"}
                  <ArrowRight size={15} />
                </button>
              </article>
            ))}
          </div>
          {!isSuper && decorated.topics.length > 0 && (
            <div className="panel mcr-more-topics">
              <div>
                <h3>获取更多专题练习</h3>
                <p>
                  完成当前所有题组后，每次选择一个专题。当前还可选择{" "}
                  {cap.remaining} 个新专题。
                </p>
              </div>
              <button
                className="btn btn-primary"
                disabled={!cap.allowed || busy}
                onClick={() => setShowTopics(!showTopics)}
              >
                选择新专题
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
      {group && view === "question" && (
        <section className="panel mcr-work">
          <div className="mcr-work-top">
            <button className="mcr-back" onClick={() => setView("list")}>
              <ArrowLeft size={15} />
              全部题组
            </button>
            <strong>{group.AddPerson}</strong>
            <button
              className="btn btn-secondary"
              onClick={() => setShowSheet(!showSheet)}
            >
              答题卡 {Math.min(index + 1, questions.length)}/{questions.length}
            </button>
          </div>
          {showSheet && (
            <div className="mcr-sheet">
              {questions.map((q, i) => (
                <button
                  key={`${questionId(q)}-${i}`}
                  className={`${i === index ? "active" : ""} ${recommendationRecordComplete(q) ? (Number(q._c_course_users_record.AnswerState) === 1 ? "correct" : "incorrect") : ""}`}
                  onClick={() => move(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          <div className="mcr-question-title">
            <span className="mcr-pill">第 {index + 1} 题</span>
            <span>{question.QuestionType || "综合题"}</span>
            {saved && (
              <span className="mcr-saved">
                <Check size={14} />
                已保存
              </span>
            )}
            {encore && <span className="mcr-muted">本轮重做</span>}
          </div>
          <MathQuestionReader
            key={`recommend-reader-${attempt.current}`}
            row={{
              ...question,
              MyAnswer:
                answers[qid] ?? question._c_course_users_record?.Answer ?? "",
              Source: "课程",
            }}
            stuid={stuid}
            practice
            selfAssessmentOnly
            readOnly={saved || review}
            prev={index > 0 ? () => move(index - 1) : undefined}
            next={
              index + 1 < questions.length ? () => move(index + 1) : undefined
            }
            noteSource="课程"
            isCourse={false}
            onAnalysisViewed={() => setRevealed(true)}
            onAnswered={async (givenAnswer, correct, details) => {
              await save(Number(correct), givenAnswer, details?.options || []);
            }}
          />
          <div className="mcr-actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void finishGroup()}
            >
              本组学习报告
            </button>
          </div>
        </section>
      )}
      {group && view === "report" && (
        <section className="panel mcr-report">
          <button className="mcr-back" onClick={() => setView("list")}>
            <ArrowLeft size={15} />
            全部题组
          </button>
          <h2>{group.AddPerson} · 突破报告</h2>
          <div className="mcr-report-stats">
            <div>
              <small>已掌握</small>
              <strong>
                {group.correct}
                <span> / {questions.length} 题</span>
              </strong>
            </div>
            <div>
              <small>掌握率</small>
              <strong>
                {questions.length
                  ? Math.round((group.correct / questions.length) * 100)
                  : 0}
                %
              </strong>
            </div>
            <div>
              <small>待巩固</small>
              <strong>{questions.length - group.correct} 题</strong>
            </div>
          </div>
          <div className="mcr-sheet">
            {questions.map((q, i) => (
              <button
                key={`${questionId(q)}-${i}`}
                className={
                  Number(q._c_course_users_record?.AnswerState) === 1
                    ? "correct"
                    : "incorrect"
                }
                onClick={() => {
                  setReview(true);
                  setEncore(false);
                  setView("question");
                  setIndex(i);
                  setRevealed(true);
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="mcr-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                setReview(true);
                setEncore(false);
                setView("question");
                setIndex(0);
                setRevealed(true);
              }}
            >
              查看解析
            </button>
            <button className="btn btn-secondary" onClick={redo}>
              再做一遍
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void append(group.LinkSort)}
            >
              追加本专题题目
            </button>
          </div>
          {materials(group)}
        </section>
      )}
      {showTopics && (
        <section className="panel mcr-topic-selection">
          <h3>选择一个新专题</h3>
          <p className="mcr-muted">
            根据原测评中待巩固和已掌握题目对应的考点选择。
          </p>
          {decorated.topics.map((original, i) => (
            <div className="mcr-original-topic" key={original.QuestionID || i}>
              <h4>
                {questionName(original, i)} ·{" "}
                {Number(original._c_course_users_record?.AnswerState) === 1
                  ? "已掌握题目对应专题"
                  : "待巩固题目对应专题"}
              </h4>
              <RichContent
                content={original._question_list?.QuestionTxt || ""}
              />
              <div>
                {original.specialList.map((topic: R) => (
                  <button
                    className={`mcr-topic-option ${selectedTopic === String(topic.ID) ? "active" : ""}`}
                    key={topic.ID}
                    disabled={topic.existing || busy}
                    onClick={() => setSelectedTopic(String(topic.ID))}
                  >
                    <strong>{topic.Name || topic.Title || "专题"}</strong>
                    <span>
                      难度 {topic.BusValue || "—"} 星
                      {topic.existing ? " · 已有题组" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mcr-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !selectedTopic || !allComplete}
              onClick={() => void append(selectedTopic)}
            >
              确认追加所选专题
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowTopics(false)}
            >
              取消
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
