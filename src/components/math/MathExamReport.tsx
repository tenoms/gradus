import MathReportShare from "./MathReportShare";
import MathCourseReportMore from "./MathCourseReportMore";
import MathCourseRecommendations from "./MathCourseRecommendations";
import MathCourseHistory from "./MathCourseHistory";
import { courseMinutes } from "./course-model.mjs";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import RichContent from "../RichContent";
import MathQuestionVideo from "./MathQuestionVideo";
import { mathApi, mathData, mathRows } from "../../platforms/math";
import type { MathPaperContext, ExamRow as Row } from "./math-exams";
import { loadMathReport } from "./math-report";
import {
  reportRows,
  reportTables,
  reportFileLinks,
  scoreGroups,
  weeklyDimensionScores,
  weeklyRhythm,
  weeklyTaskGroups,
  courseReportPrintLinks,
} from "./report-model.mjs";
import "./math-report.css";

interface Props {
  context: MathPaperContext;
  meta: Row;
  paperlog: Row;
  questions: Row[];
  onReview?: (index?: number) => void;
  onOpenPaper?: (context: MathPaperContext) => void;
}
function NumericCards({ items }: { items: { label: string; value: any }[] }) {
  return (
    <div className="mer-numbers">
      {items
        .filter(
          (r) => r.value !== undefined && r.value !== null && r.value !== "",
        )
        .map((r) => (
          <div key={r.label}>
            <small>{r.label}</small>
            <strong>{String(r.value)}</strong>
          </div>
        ))}
    </div>
  );
}
function Bars({
  rows,
  unit = "",
  max,
  percent = false,
}: {
  rows: { label: string; value: number | null; detail?: string }[];
  unit?: string;
  max?: number;
  percent?: boolean;
}) {
  const top = max || Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  return (
    <div className="mer-bars">
      {rows.map((row, i) => (
        <div className="mer-bar-row" key={`${row.label}-${i}`}>
          <span>{row.label}</span>
          <div className="mer-track">
            <i
              style={{
                width: `${Math.max(0, Math.min(100, (Number(row.value || 0) / top) * 100))}%`,
              }}
            />
          </div>
          <strong>
            {row.value === null ? "—" : Number(row.value.toFixed(1))}
            {row.value !== null ? (percent ? "%" : unit) : ""}
          </strong>
          {row.detail && <small>{row.detail}</small>}
        </div>
      ))}
    </div>
  );
}
export function MathReportDownloads({ sources }: { sources: any[] }) {
  const links = reportFileLinks(...sources),
    [copied, setCopied] = useState(""),
    [error, setError] = useState("");
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setError("");
    } catch {
      setError("未能复制地址，可使用“打开资料”后复制浏览器地址。");
    }
  }
  return (
    <section className="mer-section">
      <div className="mer-heading">
        <FileText size={19} />
        <h3>PDF 与学习资料</h3>
      </div>
      {links.length ? (
        <div className="mer-downloads">
          {links.map((file, index) => (
            <div key={file.url}>
              <span>
                <FileText size={19} />
                {file.label}
                {links.filter((f) => f.label === file.label).length > 1
                  ? ` ${index + 1}`
                  : ""}
              </span>
              <a
                className="btn btn-secondary"
                href={file.url}
                target="_blank"
                rel="noreferrer"
                download
              >
                <Download size={15} />
                打开资料
              </a>
              <button
                className="mer-icon"
                aria-label={`复制${file.label}地址`}
                onClick={() => void copy(file.url)}
              >
                {copied === file.url ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mer-muted">当前试卷未返回已授权的下载地址。</p>
      )}
      {error && <p className="mer-error">{error}</p>}
    </section>
  );
}
function MathCoursePrintDownloads({
  context,
  meta,
  papers,
}: {
  context: MathPaperContext;
  meta: Row;
  papers: Row[];
}) {
  const links = courseReportPrintLinks(context, meta, papers),
    [copied, setCopied] = useState(""),
    [error, setError] = useState("");
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setError("");
    } catch {
      setError("未能复制地址，可打开原平台打印页后复制浏览器地址。");
    }
  }
  if (!links.length) return null;
  return (
    <section className="mer-section">
      <div className="mer-heading">
        <FileText size={19} />
        <h3>课程试卷打印</h3>
      </div>
      <div className="mer-downloads">
        {links.map((file) => (
          <div key={file.url}>
            <span>
              <FileText size={19} />
              {file.label}
            </span>
            <a
              className="btn btn-secondary"
              href={file.url}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={15} />
              打开打印页
            </a>
            <button
              className="mer-icon"
              aria-label={`复制${file.label}地址`}
              onClick={() => void copy(file.url)}
            >
              {copied === file.url ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mer-error">{error}</p>}
    </section>
  );
}

function QuestionPreview({ row, onBack }: { row: Row; onBack: () => void }) {
  const [data, setData] = useState<Row>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const id = row.QuestionID || row.ID;
    Promise.all([mathApi.question(id), mathApi.analysis(id)])
      .then(([question, analysis]) => {
        if (active)
          setData({
            question: mathRows(question)[0],
            analysis: mathRows(analysis),
          });
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
  }, [row.QuestionID, row.ID]);
  return (
    <div className="mer-preview">
      <button className="mer-back" onClick={onBack}>
        <ArrowLeft size={15} />
        返回报告
      </button>
      <h3>{row.Title || row.Name || "推荐知识点"}</h3>
      {loading && (
        <p className="mer-loading">
          <LoaderCircle className="spin" size={18} />
          正在读取知识点与解析…
        </p>
      )}
      {error && <p className="mer-error">{error}</p>}
      <RichContent
        content={
          data?.question?.QuestionTxt || data?.question?.Content || row.Content
        }
      />
      {data?.question?.QuestionImg && (
        <img src={data.question.QuestionImg} alt="推荐题目" />
      )}
      {data?.analysis?.map((a: Row, i: number) => (
        <section key={a.ID || i}>
          <h4>{a.Title || a.BusType || "解析"}</h4>
          <RichContent content={a.Context || a.Content} />
          {String(a.BusType).includes("视频") && <MathQuestionVideo row={a} />}
          <MathReportDownloads sources={[a]} />
        </section>
      ))}
    </div>
  );
}
function RecommendedAlbum({ row, onBack }: { row: Row; onBack: () => void }) {
  const [content, setContent] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    mathApi
      .albumItems(row.CatalogID || row.ID)
      .then((r) => {
        if (active) setContent(mathRows(r));
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
  }, [row.CatalogID, row.ID]);
  function render(items: Row[], depth = 0): any {
    return items.map((item, index) => (
      <article key={`${item.ID}-${index}`} className="mer-album-block">
        <h4>{item.Title || item.Name || ""}</h4>
        <RichContent content={item.Content || item.QuestionTxt} />
        {item.QuestionImg && <img src={item.QuestionImg} alt="学习资料" />}
        {(item.PlayVid || item.BusType === "视频") && (
          <MathQuestionVideo
            row={{
              ...item,
              PolyvVID: item.PlayVid || item.PolyvVID || item.BusValue,
            }}
          />
        )}
        {item._question_files
          ?.filter((f: Row) => f.BusType === "视频解析")
          .map((f: Row, j: number) => (
            <MathQuestionVideo key={f.ID || j} row={f} />
          ))}
        {reportFileLinks(item).length > 0 && (
          <MathReportDownloads sources={[item]} />
        )}{" "}
        {depth < 5 &&
          Array.isArray(item.ContentList) &&
          render(item.ContentList, depth + 1)}
      </article>
    ));
  }
  return (
    <div className="mer-preview">
      <button className="mer-back" onClick={onBack}>
        <ArrowLeft size={15} />
        返回推荐计划
      </button>
      <h3>{row.Title || row.Name || "推荐学习内容"}</h3>
      {loading && (
        <p className="mer-loading">
          <LoaderCircle className="spin" size={18} />
          正在读取专辑章节…
        </p>
      )}
      {error && <p className="mer-error">{error}</p>}
      {render(content)}
    </div>
  );
}
function Distribution({
  response,
  course,
  userRoot,
}: {
  response: any;
  course: boolean;
  userRoot: number;
}) {
  const tables = reportTables(response),
    selected = course
      ? tables[0]?.[0]
      : (userRoot > 1 && userRoot < 7 ? tables[0]?.[0] : tables[1]?.[0]) ||
        tables.find((t) => t.length)?.[0];
  if (!selected) return null;
  const count = course ? 6 : 15,
    labels = course
      ? ["0–39", "40–69", "70–89", "90–109", "110–129", "130–150"]
      : Array.from(
          { length: 15 },
          (_, i) => `${i === 0 ? 0 : i * 10 + 1}–${(i + 1) * 10}`,
        );
  const rows = Array.from({ length: count }, (_, i) => ({
    label: labels[i],
    value: Number(selected[`${course ? "a" : "data"}${i + 1}`] || 0),
  }));
  return (
    <section className="mer-section">
      <h3>参试分数分布</h3>
      <Bars rows={rows} unit=" 人" />
    </section>
  );
}

export default function MathExamReport({
  context,
  meta,
  paperlog,
  questions,
  onReview,
  onOpenPaper,
}: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
      data: Row;
      errors: { name: string; message: string }[];
    }>({ data: {}, errors: [] }),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0),
    [preview, setPreview] = useState<Row>(),
    [album, setAlbum] = useState<Row>(),
    [recommendation, setRecommendation] = useState<Row>(),
    [tab, setTab] = useState("subject");
  const userRoot = Number(paperlog.UserRoot || (context as any).UserRoot || 1),
    key = JSON.stringify(context);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadMathReport(context, meta, questions, userRoot)
      .then((r) => {
        if (active) setResult(r);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, userRoot, version]);
  if (preview)
    return (
      <QuestionPreview row={preview} onBack={() => setPreview(undefined)} />
    );
  if (album)
    return <RecommendedAlbum row={album} onBack={() => setAlbum(undefined)} />;
  const data = result.data,
    summary = reportTables(data.summary),
    summaryRow = summary[0]?.[0] || {},
    scores = reportRows(data.scores),
    knowledge = reportRows(data.knowledge),
    dimensions = reportRows(data.dimensions),
    radar = weeklyDimensionScores(dimensions),
    rhythm = weeklyRhythm(dimensions),
    maxTime = Math.max(60, ...rhythm.map((r) => r.seconds || 0));
  const sourceRows = scores.length
    ? scores
    : questions.map((q) => ({
        ...q,
        Score: q.qScore ?? q.Score,
        QuestionScore:
          context.kind === "weekly"
            ? (q.uScore ?? q.ks_user_record?.Score)
            : context.isTeacher
              ? q._c_paper_student_record?.QuestionScore
              : context.kind === "course"
                ? q._c_course_users_record?.BusValue
                : q._log?.QuestionScore,
        kmName:
          q.kmName ||
          q.Type ||
          q.QuestionType ||
          q._question_list?.Type ||
          "综合题",
      }));
  const groups = scoreGroups(
      sourceRows,
      tab === "type" ? "QuestionType" : "kmName",
    ),
    recommendations = mathData(data.recommendations),
    weeklyRecommended =
      context.kind === "weekly" ? reportRows(data.recommendations) : [],
    tasks = weeklyTaskGroups(weeklyRecommended),
    history = reportRows(data.history),
    papers: Row[] =
      context.kind === "course"
        ? [
            ...(Array.isArray(recommendations?.MyPaperList)
              ? recommendations.MyPaperList
              : []),
            ...reportRows(data.followup),
          ]
        : [],
    points: Row[] =
      context.kind === "course"
        ? Array.isArray(recommendations?.KDList)
          ? recommendations.KDList
          : []
        : knowledge;
  const scopes = String(meta.ExamScope || "")
      .split(",")
      .filter(Boolean),
    scopeRows = reportRows(data.scopes).filter((row) =>
      scopes.includes(String(row.Code)),
    );
  if (recommendation)
    return (
      <MathCourseRecommendations
        stuid={context.stuid}
        PaperID={recommendation.ID}
        CourseID={context.CourseID || 0}
        CalendarID={context.CalendarID || 0}
        ProductID={context.ProductID || 0}
        isSuper={!!recommendation.isSuper}
        onClose={() => setRecommendation(undefined)}
      />
    );
  return (
    <div className="math-exam-report-extras" ref={reportRef}>
      {!loading && (
        <MathReportShare
          rootRef={reportRef}
          title={meta.Name || meta.PaperName || "数学学习报告"}
        />
      )}
      {context.kind === "course" && (
        <MathCourseReportMore
          context={context}
          meta={meta}
          questions={questions}
        />
      )}{" "}
      {context.kind === "course" && context.CourseID && (
        <section className="mer-section">
          <MathCourseHistory
            stuid={context.stuid}
            CourseID={context.CourseID}
            busType={Number(meta.BusType) === 3 ? 3 : 1}
          />
        </section>
      )}
      <div className="mer-heading">
        <h2>复盘与下一步训练</h2>
        <button
          className="btn btn-secondary"
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={15} />
          刷新报告
        </button>
      </div>
      {loading && (
        <p className="mer-loading" role="status">
          <LoaderCircle className="spin" size={19} />
          正在整理学习分析…
        </p>
      )}
      {result.errors.map((error, index) => (
        <p className="mer-error" key={index}>
          部分报告暂未返回：{error.message}
        </p>
      ))}
      <NumericCards
        items={
          context.kind === "dry"
            ? [
                { label: "本次成绩", value: summaryRow.Score },
                { label: "本组排名", value: summaryRow.rank1 },
                { label: "参试人数", value: summary[2]?.[0]?.suncount },
                { label: "本组均分", value: summary[3]?.[0]?.score },
              ]
            : context.kind === "course"
              ? [
                  { label: "试卷排名", value: summaryRow.ranking },
                  { label: "试卷均分", value: summary[1]?.[0]?.avgs },
                ]
              : [
                  {
                    label: "总得分",
                    value: meta.TotalScore ?? paperlog.TotalScore,
                  },
                  {
                    label: "答题用时",
                    value:
                      meta.TotalTime != null
                        ? `${Math.round(Number(meta.TotalTime) / 60)} 分钟`
                        : undefined,
                  },
                ]
        }
      />
      <MathReportDownloads
        sources={[meta, paperlog, ...(context.kind === "course" ? papers : [])]}
      />
      <MathCoursePrintDownloads context={context} meta={meta} papers={papers} />
      {scopeRows.length > 0 && (
        <section className="mer-section">
          <h3>本次考察范围</h3>
          <div className="mer-tags">
            {scopeRows.map((r, i) => (
              <span key={r.ID || i}>{r.Name}</span>
            ))}
          </div>
        </section>
      )}
      <Distribution
        response={data.distribution}
        course={context.kind === "course"}
        userRoot={userRoot}
      />
      {groups.length > 0 && (
        <section className="mer-section">
          <div className="mer-heading">
            <h3>得分与薄弱环节</h3>
            {scores.length > 0 && (
              <div className="tabs">
                <button
                  className={tab === "subject" ? "active" : ""}
                  onClick={() => setTab("subject")}
                >
                  按知识领域
                </button>
                <button
                  className={tab === "type" ? "active" : ""}
                  onClick={() => setTab("type")}
                >
                  按题型
                </button>
              </div>
            )}
          </div>
          <Bars
            rows={groups.map((r) => ({
              label: r.label,
              value: r.percent,
              detail: `${r.score} / ${r.max} 分 · 丢分 ${r.loss}`,
            }))}
            max={100}
            percent
          />
        </section>
      )}
      {context.kind === "dry" &&
        reportRows(data.population, userRoot > 1 && userRoot < 7 ? 0 : 3)
          .length > 0 && (
          <section className="mer-section">
            <h3>参试群体题型表现</h3>
            <Bars
              rows={reportRows(
                data.population,
                userRoot > 1 && userRoot < 7 ? 0 : 3,
              ).map((r, i) => ({
                label: String(r.Name || `题型 ${i + 1}`),
                value: Number(r.Cont || 0),
              }))}
            />
          </section>
        )}
      {radar.length > 0 && (
        <section className="mer-section">
          <h3>五维能力诊断</h3>
          <Bars
            rows={radar.map((r) => ({
              label: r.label,
              value: r.percent,
              detail: r.max
                ? `${r.score} / ${r.max}`
                : "当前没有该维度的评分依据",
            }))}
            max={100}
            percent
          />
        </section>
      )}
      {rhythm.length > 0 && (
        <section className="mer-section">
          <h3>答题节奏</h3>
          <p className="mer-muted">
            用时颜色沿用原题型阈值：绿色正常、橙色偏高、红色超时。
          </p>
          <div className="mer-rhythm">
            {rhythm.map((row, index) => (
              <button
                key={index}
                className={row.status}
                onClick={() => onReview?.(index)}
                title={`第${row.number}题：${row.seconds === null ? "未记录用时" : Math.round(row.seconds) + "秒"}`}
              >
                <strong>
                  {row.seconds === null
                    ? "—"
                    : `${Math.round((row.seconds / 60) * 10) / 10}m`}
                </strong>
                <span
                  style={{
                    height: `${Math.max(2, (Number(row.seconds || 0) / maxTime) * 100)}px`,
                  }}
                />
                <small>{row.number}</small>
              </button>
            ))}
          </div>
          <NumericCards
            items={[
              {
                label: "正常节奏",
                value: rhythm.filter((r) => r.status === "steady").length,
              },
              {
                label: "用时偏高",
                value: rhythm.filter((r) => r.status === "watch").length,
              },
              {
                label: "超时题目",
                value: rhythm.filter((r) => r.status === "slow").length,
              },
            ]}
          />
        </section>
      )}
      {history.length > 0 && (
        <section className="mer-section">
          <h3>历次学习成绩</h3>
          <Bars
            rows={history.map((r, i) => ({
              label: String(r.Use || r.Name || r.AddTime || `第 ${i + 1} 次`),
              value: Number(r.BusValue ?? r.Score ?? 0),
            }))}
            max={150}
            unit=" 分"
          />
        </section>
      )}
      {tasks.length > 0 && (
        <section className="mer-section">
          <h3>错题后的巩固计划</h3>
          <p className="mer-muted">按原平台推荐内容与预计学习时长分组。</p>
          {tasks.map((group, index) => (
            <div className="mer-task-group" key={index}>
              <div className="mer-heading">
                <strong>训练 {index + 1}</strong>
                <span>约 {Math.round(group.hours * 10) / 10} 小时</span>
              </div>
              {group.rows.map((r, i) => (
                <button
                  className="mer-recommend"
                  key={r.ID || i}
                  onClick={() => setAlbum(r)}
                >
                  <BookOpen size={20} />
                  <span>
                    <strong>{r.Title || r.Name || "推荐章节"}</strong>
                    <small>
                      {Number(r.UseTime || 0)} 小时 · {r.counts ?? "—"} 项内容
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ))}
        </section>
      )}
      {points.length > 0 && (
        <section className="mer-section">
          <h3>推荐考点与标准解法</h3>
          {points.map((row, index) => (
            <button
              className="mer-recommend"
              key={row.ID || index}
              disabled={!row.QuestionID}
              onClick={() => setPreview(row)}
            >
              <BookOpen size={19} />
              <span>
                <strong>
                  {row.LinkName ||
                    row.Title ||
                    row.StandardName ||
                    row.Name ||
                    `第 ${index + 1} 项考点`}
                </strong>
                {row.StandardName && <small>{row.StandardName}</small>}
              </span>
              {row.QuestionID && <ChevronRight size={16} />}
            </button>
          ))}
        </section>
      )}
      {papers.length > 0 && (
        <section className="mer-section">
          <h3>个性化练习与进步测评</h3>
          {papers.map((paper, index) => (
            <div className="mer-recommend" key={paper.ID || index}>
              <FileText size={20} />
              <span>
                <strong>{paper.Name || paper.Title || "推荐练习"}</strong>
                <small>
                  {paper.Times
                    ? `${courseMinutes(paper.Times)} 分钟`
                    : "查看已生成的学习试卷"}
                </small>
              </span>
              <MathReportDownloads sources={[paper]} />
              {onOpenPaper && (
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    Number(paper.BusType) === 2
                      ? setRecommendation(paper)
                      : onOpenPaper({
                          ...context,
                          PaperID: paper.ID,
                          kind: "course",
                          isAbility: false,
                          isTeacher: false,
                        })
                  }
                >
                  进入练习
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {context.kind === "course" &&
        Array.isArray(recommendations?.specialList) &&
        recommendations.specialList.length > 0 && (
          <section className="mer-section">
            <h3>专题训练资料</h3>
            {recommendations.specialList.map((row: Row, i: number) => (
              <div className="mer-recommend" key={row.ID || i}>
                <span>
                  <RichContent content={row.Name || row.Title} />
                </span>
                <MathReportDownloads sources={[row]} />
              </div>
            ))}
          </section>
        )}
      {onReview && (
        <button className="btn btn-secondary" onClick={() => onReview()}>
          回顾作答与解析
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
