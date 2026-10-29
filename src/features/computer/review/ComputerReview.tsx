import { useEffect, useState } from "react";
import { confirmAction } from "../../../shared/ui/dialogs/InteractionProvider";
import {
  ArrowRight,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import {
  computerRequest as request,
  computerSubjects,
  descendants,
  identity,
  label,
  records,
  typeNames,
} from "../api/computer";
import type { ComputerRecord as R } from "../api/computer";
import {
  computerHistoryTypes,
  computerInterviewSubject,
  computerLearningApi,
  computerReviewData,
  computerSubjectKey,
} from "../practice/computer-learning";
import type { ComputerExerciseLaunch } from "../practice/computer-learning";
import { ComputerSubjectPicker, useComputerSubjects } from "../practice/ComputerSubjects";
import ComputerStages, { ComputerExamReport } from "./ComputerReports";
import ImportedReportSummary from "../../identity/ImportedReportSummary";

function useData(path: string, query: R) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [version, setVersion] = useState(0),
    serialized = JSON.stringify(query);
  useEffect(() => {
    if (!path) {
      setData(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    request(path, JSON.parse(serialized))
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
  }, [path, serialized, version]);
  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
}
function State({
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
    <p className="computer-status" role="status">
      <LoaderCircle className="spin" size={18} />
      正在读取学习记录…
    </p>
  ) : error ? (
    <p className="computer-error" role="alert">
      {error}
      {retry && (
        <button className="btn btn-secondary" onClick={retry}>
          重试
        </button>
      )}
    </p>
  ) : empty ? (
    <div className="empty-state">当前筛选下没有学习记录</div>
  ) : null;
}
const metricLabels: R = {
  exerciseDay: "累计学习天数",
  answerTotal: "累计答题数",
  failRate: "错误率",
  ranking: "学习排名",
  examinationExerciseTotalNum: "累计试卷题数",
  totalNumber: "累计题数",
  incorrectNumber: "错题数",
  collectNumber: "收藏数",
  correctNumber: "正确题数",
  accuracy: "正确率",
  practiceTime: "学习时长",
  answerTime: "答题时长",
  exerciseNumber: "答题数",
  answerNumber: "已答题数",
  exerciseTotal: "累计题数",
  incorrectTotal: "错题数",
  correctRate: "正确率",
  userCount: "学习人数",
  totalExerciseNumber: "累计题数",
};
function Metrics({ data }: { data: R }) {
  return (
    <div className="computer-report-stats">
      {Object.entries(data).flatMap(([key, value]) =>
        value != null && typeof value !== "object" && metricLabels[key]
          ? [
              <div key={key}>
                <small>{metricLabels[key]}</small>
                <strong>
                  {typeof value === "number" && /Rate|accuracy/i.test(key)
                    ? `${Math.round(value * 1000) / 10}%`
                    : String(value)}
                </strong>
              </div>,
            ]
          : [],
      )}
    </div>
  );
}

export default function ComputerReview({
  initial = "mistakes",
  launch,
}: {
  initial?: string;
  launch: (s: ComputerExerciseLaunch) => void;
}) {
  const { subjects } = useComputerSubjects(),
    [tab, setTab] = useState(initial),
    [subject, setSubject] = useState<R>(computerSubjects[0]),
    [page, setPage] = useState(1),
    [date, setDate] = useState("1"),
    [sort, setSort] = useState("create_date"),
    [chapter, setChapter] = useState(""),
    [historyType, setHistoryType] = useState(3),
    [school, setSchool] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [report, setReport] = useState<R | null>(null),
    [reportItem, setReportItem] = useState<R | null>(null);
  const major = String(subject.id),
    category = Number(subject.examCategory || 1),
    choices = [...subjects, computerInterviewSubject].filter(
      (s, i, a) =>
        a.findIndex((v) => computerSubjectKey(v) === computerSubjectKey(s)) ===
        i,
    ),
    isQuestions = ["mistakes", "collection", "notes"].includes(tab),
    kind = tab === "mistakes" ? "mistakes" : "collection";
  const chapters = useData(
      isQuestions && major !== computerInterviewSubject.id
        ? "/api/exam/wx/practice/knowledge"
        : "",
      { majorId: major, examType: category === 2 ? 9 : 2 },
    ),
    dates = useData(
      isQuestions ? "/api/exam/wx/personal/countDiffDateExercise" : "",
      {
        majorId: major,
        examCategory: category,
        itemFlag: tab === "mistakes" ? 2 : 1,
      },
    ),
    counts = useData(
      tab === "mistakes"
        ? "/api/exam/wx/personal/countDiffChapterExercise"
        : "",
      { majorId: major, examCategory: category, dateFlag: date },
    ),
    schools = useData(
      tab === "history" && historyType === 1
        ? "/api/exam/wx/practice/school"
        : "",
      { parentId: "701741873861103616" },
    );
  const path =
    tab === "overview"
      ? "/api/exam/wx/personal/exercise/stat"
      : tab === "mistakes"
        ? "/api/exam/wx/personal/incorrectExerciseList"
        : tab === "history"
          ? "/api/exam/wx/practice/examinationRecord"
          : tab === "ranking"
            ? "/api/exam/wx/personal/exercise/stat/top100"
            : isQuestions
              ? "/api/exam/wx/personal/collectExerciseList"
              : "";
  const list = useData(
      path,
      tab === "overview" || tab === "ranking"
        ? {}
        : tab === "history"
          ? {
              pageNum: page,
              pageSize: 20,
              examType: historyType,
              ...(historyType === 1
                ? { schoolId: school || undefined }
                : { majorId: major }),
            }
          : {
              majorId: major,
              pageNum: page,
              pageSize: 20,
              dateFlag: date,
              chapterId: chapter,
              sort,
              examCategory: category,
            },
    ),
    rows = records(list.data).filter(
      (item) => tab !== "notes" || item.exerciseNote || item.note,
    ),
    pages = Number(
      list.data?.pages || Math.ceil(Number(list.data?.total || 0) / 20) || 1,
    );
  useEffect(() => {
    if (!school && records(schools.data).length)
      setSchool(identity(records(schools.data)[0]));
  }, [schools.data, school]);
  async function open(item: R) {
    setBusy(true);
    setError("");
    try {
      if (tab === "history") {
        setReportItem(item);
        setReport(item._imported ? { importedSummary: item } : await computerLearningApi.historyReport(item, category));
      } else {
        const raw = await request(
            "/api/exam/wx/searchExercise/info/" +
              encodeURIComponent(String(item.exerciseId || item.id)),
          ),
          detail = raw?.exercise || raw;
        launch({
          data: {
            exercises: [{ ...item, ...detail }],
            answerList: item.answer ? [item] : [],
          },
          title:
            tab === "mistakes"
              ? "错题回顾"
              : tab === "notes"
                ? "学习笔记"
                : "收藏回顾",
          majorId: major,
          examType: category === 2 ? 10 : 3,
          examCategory: category,
          chapterId: item.chapterId,
          readOnly: true,
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function redo(item?: R) {
    setBusy(true);
    setError("");
    try {
      const data = item
        ? { list: [item], total: 1 }
        : await computerLearningApi.reviewPage(kind, {
            majorId: major,
            chapterId: chapter,
            pageNum: 1,
            pageSize: 1,
            dateFlag: date,
            sort,
            examCategory: category,
          });
      launch({
        data: computerReviewData(data),
        title: tab === "mistakes" ? "错题重做" : "收藏重做",
        majorId: major,
        chapterId: item?.chapterId || chapter,
        examType: category === 2 ? 10 : 3,
        examCategory: category,
        answerSource: tab === "mistakes" ? 4 : 5,
        ...(!item
          ? { redo: { kind, dateFlag: date, sort } }
          : {
              redo: { kind, dateFlag: date, sort },
              data: { ...computerReviewData(data), exerciseTotalNumber: 1 },
            }),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: R) {
    setBusy(true);
    setError("");
    try {
      if (tab === "mistakes")
        await computerLearningApi.markMistake(item,major,item.chapterId,category,true);
      else
        await request("/api/exam/wx/personal/collectExercise", {
          exerciseId: item.exerciseId,
          majorId: item.majorId || major,
          chapterId: item.chapterId,
          examCategory: category,
          collectFlag: 1,
        });
      setNotice(tab === "mistakes" ? "已从错题本移除" : "已取消收藏");
      list.reload();
      dates.reload();
      counts.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="tabs computer-source-tabs">
        {[
          ["overview", "学习统计"],
          ["stages", "阶段报告"],
          ["mistakes", "错题本"],
          ["collection", "我的收藏"],
          ["notes", "学习笔记"],
          ["history", "答题记录"],
          ["ranking", "学习排行"],
        ].map(([id, title]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setPage(1);
              setReport(null);
              setError("");
            }}
          >
            {title}
          </button>
        ))}
      </div>
      {tab === "stages" ? (
        <ComputerStages launch={launch} />
      ) : (
        <>
          {tab !== "overview" && tab !== "ranking" && (
            <div className="panel computer-toolbar">
              {tab === "history" && (
                <select
                  className="input computer-select"
                  aria-label="选择答题记录类型"
                  value={historyType}
                  onChange={(e) => {
                    setHistoryType(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {computerHistoryTypes.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {tab === "history" && historyType === 1 ? (
                <select
                  className="input computer-select"
                  aria-label="选择真题院校"
                  value={school}
                  onChange={(e) => {
                    setSchool(e.target.value);
                    setPage(1);
                  }}
                >
                  {records(schools.data).map((s) => (
                    <option key={identity(s)} value={identity(s)}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              ) : (
                <ComputerSubjectPicker
                  subjects={choices}
                  value={subject}
                  onChange={(s) => {
                    setSubject(s);
                    setPage(1);
                    setChapter("");
                  }}
                />
              )}
              {isQuestions && (
                <>
                  <select
                    className="input computer-select"
                    aria-label="按章节筛选复习记录"
                    value={chapter}
                    onChange={(e) => {
                      setChapter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">全部章节</option>
                    {descendants(records(chapters.data)).map((c, i) => {
                      const count = records(counts.data).find(
                        (r) => String(r.chapterId) === identity(c),
                      );
                      return (
                        <option key={i} value={identity(c)}>
                          {label(c)}
                          {count
                            ? ` · ${count.incorrectChapterNumber || 0} 错题`
                            : ""}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    className="input computer-select"
                    aria-label="按时间筛选复习记录"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setPage(1);
                    }}
                  >
                    {["本周", "上周", "两周前", "一个月前"].map((title, i) => (
                      <option key={i} value={i + 1}>
                        {title}
                        {dates.data?.[i + 1] != null
                          ? ` · ${dates.data[i + 1]} 题`
                          : ""}
                      </option>
                    ))}
                  </select>
                  {tab === "mistakes" && (
                    <select
                      className="input computer-select"
                      aria-label="错题排序"
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="create_date">最近加入</option>
                      <option value="incorrect_number">错误次数</option>
                    </select>
                  )}
                  {tab !== "notes" && (
                    <button
                      className="btn btn-primary"
                      disabled={busy || !rows.length}
                      onClick={() => void redo()}
                    >
                      重做当前题集
                      <ArrowRight size={15} />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <State
            loading={busy}
            error={
              error ||
              chapters.error ||
              dates.error ||
              counts.error ||
              schools.error
            }
          />
          {notice && (
            <p className="computer-notice" role="status">
              {notice}
            </p>
          )}
          {report && (
            <div className="panel">
              {report.importedSummary ? <ImportedReportSummary record={report.importedSummary} /> : <ComputerExamReport
                data={report}
                majorId={major}
                onOpen={launch}
                onRefresh={() => {
                  if (reportItem) void open(reportItem);
                }}
              />}
              <button
                className="btn btn-secondary"
                onClick={() => setReport(null)}
              >
                收起报告
              </button>
            </div>
          )}
          <div className="panel">
            <State
              loading={list.loading}
              error={list.error}
              empty={
                tab !== "overview" &&
                !list.loading &&
                !list.error &&
                !rows.length
              }
              retry={list.reload}
            />
            {tab === "overview" && list.data && (
              <>
                <h3>计算机学习统计</h3>
                <Metrics data={list.data} />
                {Object.entries(list.data)
                  .filter(
                    ([, v]) => v && typeof v === "object" && !Array.isArray(v),
                  )
                  .map(([key, value]) => (
                    <Metrics key={key} data={value as R} />
                  ))}
              </>
            )}
            {rows.map((item, index) => (
              <div
                className="computer-review-row"
                key={`${identity(item)}-${index}`}
              >
                {tab === "ranking" ? (
                  <>
                    <span className="computer-chapter-number">{index + 1}</span>
                    <div className="computer-grow">
                      <strong>
                        {item.nickName ||
                          item.nickname ||
                          item.name ||
                          "学习者"}
                      </strong>
                      <p>
                        {item.answerTotal ??
                          item.exerciseNumber ??
                          item.answerNumber ??
                          item.totalNumber ??
                          "—"}{" "}
                        题
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="computer-grow">
                      <span className="computer-pill">
                        {item._imported ? "小程序导入 · " : ""}
                        {typeNames[item.exerciseType] ||
                          (tab === "history" ? "答题记录" : "题目")}
                      </span>
                      <RichContent
                        content={
                          item.exerciseStems ||
                          item.examinationName ||
                          item.examName ||
                          item.name ||
                          item.title ||
                          "学习记录"
                        }
                      />
                      {(item.exerciseNote || item.note) && (
                        <RichContent
                          content={item.exerciseNote || item.note}
                          className="computer-note-preview"
                        />
                      )}
                      <p className="computer-dim">
                        {item.incorrectNumber
                          ? `错误 ${item.incorrectNumber} 次 · `
                          : ""}
                        {item.collectDate ||
                          item.incorrectDate ||
                          item.createDate ||
                          item.startTime ||
                          ""}
                      </p>
                    </div>
                    <div className="computer-review-actions">
                      <button
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => void open(item)}
                      >
                        {tab === "history" ? "查看报告" : "查看解析"}
                        <ChevronRight size={15} />
                      </button>
                      {isQuestions && tab !== "notes" && (
                        <>
                          <button
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => void redo(item)}
                          >
                            重做
                          </button>
                          <button
                            className="computer-text-link"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await confirmAction({ title: tab === "mistakes" ? "从错题本移除这道题？" : "取消收藏这道题？", description: "已有作答和学习记录会保留。", confirmLabel: tab === "mistakes" ? "移出错题本" : "取消收藏", cancelLabel: "保留题目", danger: true })
                              )
                                void remove(item);
                            }}
                          >
                            {tab === "mistakes" ? "移出错题本" : "取消收藏"}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
            {tab !== "overview" && tab !== "ranking" && (
              <div className="computer-pager">
                <button
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </button>
                <span>
                  第 {page} / {pages} 页
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
