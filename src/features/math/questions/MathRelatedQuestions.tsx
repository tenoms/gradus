import { useMathLearningPlan } from "../preparation/MathLearningPlan";
import { mathMenuTree } from "../preparation/learning-plan-model.mjs";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Filter,
  Flag,
  Heart,
  LoaderCircle,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";
import {
  mathApi,
  mathCommand,
  mathData,
  mathGet,
  mathPost,
  mathRows,
  mathTables,
} from "../api/math";
import type { MathRow } from "../api/math";
import {
  matchesRelatedProperties,
  relatedGradeState,
  relatedResetPayload,
  relatedProperties,
  relatedPropertyGroups,
  matchesRelatedSubject,
  isRelatedSubjectScope,
} from "./math-related-model";
import RichContent from "../../../shared/content/RichContent";
import { answerProgress } from "../../learning/workbench/answer-progress.mjs";
import "../../learning/workbench/answer-progress.css";
import { relatedPackageRows } from "./math-related-packages";
import { recordStudy } from "../../learning/state/store";
import "./MathRelatedQuestions.css";

export interface RelatedReaderProps {
  row: MathRow;
  prev?: () => void;
  next?: () => void;
  onAnswered?: (
    answer: string,
    correct: boolean,
    details?: { question: MathRow; options: MathRow[] },
  ) => Promise<void>;
  readOnly?: boolean;
}
function useData(key: string, load: () => Promise<any>) {
  const [data, setData] = useState<any>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(undefined);
    setError("");
    load()
      .then((r) => {
        if (active) setData(r);
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
  if (loading)
    return (
      <div className="math-state">
        <LoaderCircle className="spin" size={22} />
        <p>正在读取考点刷题…</p>
      </div>
    );
  if (error)
    return (
      <div className="math-state math-error">
        <p>{error}</p>
        {retry && (
          <button className="btn btn-secondary" onClick={retry}>
            重试
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="math-state">
        <BookOpen size={28} />
        <p>当前筛选下没有题目</p>
        <small>可以调整题目分类或学习状态。</small>
      </div>
    );
  return null;
}
type Collection = { ID: number; name: string; type: number; count?: number };

export default function MathRelatedQuestions({
  stuid,
  renderQuestion,
}: {
  stuid: string;
  renderQuestion: (props: RelatedReaderProps) => ReactNode;
}) {
  const { subject } = useMathLearningPlan();
  const [source, setSource] = useState("考点刷题");
  const [collection, setCollection] = useState<Collection>();
  const [product, setProduct] = useState<MathRow>();
  const menus = useData(`related-menu-${stuid}-${source}`, async () => {
    if (source === "考点刷题")
      return mathCommand("GetRelQuestionMenu_zyk", {
        StuID: stuid,
      });
    const Type = source === "真题书籍包" ? "真题书籍包" : "自定义刷题包";
    const catalog = await mathGet("/api/c_course_product/GetProductByZyk", {
      type: Type,
      IsValid: 1,
    });
    return { data: relatedPackageRows(mathRows(catalog)) };
  });
  const [query, setQuery] = useState("");
  const allRows = mathRows(menus.data);
  const matches = (row: MathRow) => !query || [row.StandardName, row.ProductName, row.Name].join(" ").includes(query);
  const tree = mathMenuTree(allRows).filter(row => subject !== "数二" || !/概率/.test(String(row.StandardName || row.Name || "")));
  const visibleTree = (nodes: MathRow[]): MathRow[] => nodes.flatMap(row => { const children = visibleTree(row.children || []); return matches(row) || children.length ? [{ ...row, children: matches(row) ? row.children : children }] : []; });
  const rows = source === "考点刷题" ? visibleTree(tree) : allRows.filter(matches);
  if (collection)
    return (
      <RelatedCollection
        stuid={stuid}
        collection={collection}
        back={() => setCollection(undefined)}
        renderQuestion={renderQuestion}
      />
    );
  if (product)
    return (
      <PackageDetail
        row={product}
        back={() => setProduct(undefined)}
        renderQuestion={renderQuestion}
        onPractice={() =>
          setCollection({
            ID: product.ID,
            name: product.ProductName || "数学题库",
            type: source === "真题书籍包" ? 2 : 1,
          })
        }
      />
    );
  return (
    <div className="math-workspace">
      <div className="panel">
        <div className="math-toolbar">
          <div className="tabs">
            {["考点刷题", "真题书籍包", "推荐刷题包"].map((t) => (
              <button
                key={t}
                className={t === source ? "active" : ""}
                onClick={() => {
                  setSource(t);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="math-search">
            <Search size={16} />
            <input
              placeholder="搜索题库名称…"
              aria-label="搜索考点刷题"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <State
          loading={menus.loading}
          error={menus.error}
          empty={!menus.loading && !rows.length}
          retry={menus.reload}
        />
        <div className="math-content-list">
          {source === "考点刷题" ? <ExamPointMenu rows={rows} onChoose={r => setCollection({ ID: r.ID, name: r.StandardName || r.Name || "考点刷题", type: 0, count: r.QuestionCount })} /> : rows.map((r, i) => (
            <button key={r.ID || i} onClick={() => setProduct(r)}>
              <div className="math-list-icon"><BookOpen size={21} /></div>
              <span><strong>{r.ProductName || r.Name || "数学题库"}</strong><small>{r.books?.length || 0} 本书籍</small></span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function ExamPointMenu({ rows, onChoose }: { rows: MathRow[]; onChoose: (row: MathRow) => void }) {
  return <>{rows.map(row => row.children?.length ? <details className="math-point-group" key={row.ID} open><summary>{row.StandardName || row.Name}<span>{row.children.length} 个章节</span></summary><div className="math-content-list"><ExamPointMenu rows={row.children} onChoose={onChoose} /></div></details> : <button key={row.ID} onClick={() => onChoose(row)}><div className="math-list-icon"><BookOpen size={21} /></div><span><strong>{row.StandardName || row.Name || "考点刷题"}</strong><small>{row.QuestionCount || row.Count || "—"} 道题目 · 已练 {row.FinishedCount || 0} 道</small></span><ChevronRight size={18} /></button>)}</>;
}

function PackageDetail({
  row,
  back,
  onPractice,
  renderQuestion,
}: {
  row: MathRow;
  back: () => void;
  onPractice: () => void;
  renderQuestion: (props: RelatedReaderProps) => ReactNode;
}) {
  const [selectedBook, setSelectedBook] = useState<MathRow>();
  const books: MathRow[] = row.books || [];
  if (selectedBook)
    return (
      <PackageBookReader
        book={selectedBook}
        back={() => setSelectedBook(undefined)}
        renderQuestion={renderQuestion}
      />
    );
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回题库包
      </button>
      <div className="panel mrq-package">
        <span className="eyebrow">BOOK COLLECTION</span>
        <h2>{row.ProductName || "数学书籍包"}</h2>
        <RichContent content={row.Intro || row.Remark || row.Description} />
        <p className="math-muted">
          {books.length} 本书籍
        </p>
        <button className="btn btn-primary" onClick={onPractice}>
            进入分类练习
            <ArrowRight size={15} />
          </button>
      </div>
      <div className="panel math-content-list">
        {books.map((b, i) => (
          <div className="mrq-package-book" key={b.ID || i}>
            <BookOpen size={20} />
            <span>
              <strong>{b.Name || "数学书籍"}</strong>
              <small>
                {b.BookYear || ""} ·{" "}
                {b.QuestionSearchCount || b.QuestionListCount || "—"} 道题目
              </small>
            </span>
            <button className="btn btn-secondary" onClick={() => setSelectedBook(b)}>
              查看题目
            </button>
          </div>
        ))}
        {!books.length && (
          <div className="math-state">
            <p>当前书籍包暂无可展示书目</p>
          </div>
        )}
      </div>
    </div>
  );
}
function PackageBookReader({
  book,
  back,
  renderQuestion,
}: {
  book: MathRow;
  back: () => void;
  renderQuestion: (props: RelatedReaderProps) => ReactNode;
}) {
  const catalog = useData(`package-book-${book.ID}`, () =>
    mathApi.bookCatalog(book.ID),
  );
  const [current, setCurrent] = useState<number>();
  const rows = mathRows(catalog.data);
  const row = current !== undefined ? rows[current] : undefined;
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回书籍包
      </button>
      <div className="math-section-heading">
        <div>
          <h2>{book.Name}</h2>
          <p>{rows.length} 道原书题目，选择题目查看题干与解析。</p>
        </div>
      </div>
      <State
        loading={catalog.loading}
        error={catalog.error}
        empty={!catalog.loading && !rows.length}
        retry={catalog.reload}
      />
      {row ? (
        <>
          <button
            className="math-text-button"
            onClick={() => setCurrent(undefined)}
          >
            返回题目目录
          </button>
          {renderQuestion({
            row: { ...row, BookID: book.ID },
            prev: current! > 0 ? () => setCurrent(current! - 1) : undefined,
            next:
              current! < rows.length - 1
                ? () => setCurrent(current! + 1)
                : undefined,
          })}
        </>
      ) : (
        <div className="panel math-content-list">
          {rows.map((r, i) => (
            <button
              key={r.QuestionID || r.ID || i}
              onClick={() => setCurrent(i)}
            >
              <span>
                <strong>{r.ChapterName || r.Name || "原书题目"}</strong>
                <small>
                  第 {r.QuestionPage || "—"} 页 · 第 {r.QuestionSort || i + 1}{" "}
                  题
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RelatedCollection({
  stuid,
  collection,
  back,
  renderQuestion,
}: {
  stuid: string;
  collection: Collection;
  back: () => void;
  renderQuestion: (props: RelatedReaderProps) => ReactNode;
}) {
  const { subject } = useMathLearningPlan();
  const [allSubjects, setAllSubjects] = useState(false);
  const [year, setYear] = useState("全部");
  const [selectedProperties, setSelectedProperties] = useState<
    Record<string, string[]>
  >({});
  const [filterShown, setFilterShown] = useState(true);
  const [status, setStatus] = useState("全部");
  const [mode, setMode] = useState("练习模式");
  const [limit, setLimit] = useState(60);
  const [current, setCurrent] = useState<number>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [local, setLocal] = useState<Record<number, MathRow>>({});
  useEffect(() => { setCurrent(undefined); setLimit(60); setAllSubjects(false); setSelectedProperties({}); }, [subject]);
  const scope = collection.type === 0 ? 0 : collection.ID;
  const remote = useData(
    `related-questions-${collection.ID}-${collection.type}`,
    () =>
      mathCommand(
        collection.type === 0
          ? "GetRelQuestionList_rel_zyk"
          : "GetRelPaperQuestionList_zyk",
        collection.type === 0
          ? { Standard_ID: collection.ID }
          : { Standard_ID: collection.ID, ispay: 1 },
      ),
  );
  const definitions = useData("related-properties", () =>
    mathCommand("GetRelPropertyList_rel", {}),
  );
  const logs = useData(`related-logs-${stuid}-${scope}`, () =>
    mathCommand("GetUserQuestionLogTypeList_zyk", {
      StuID: stuid,
      BusID: scope,
      t: Date.now(),
    }),
  );
  const logTables = mathTables(logs.data);
  const table = logTables[4] || [];
  const rows: MathRow[] = mathRows(remote.data).map((r, i) => {
    const log =
      local[r.QuestionID] ||
      table.find((l) => String(l.QuestionID) === String(r.QuestionID)) ||
      {};
    return {
      ...r,
      ...log,
      QuestionID: r.QuestionID,
      _number: i + 1,
      ExerciseID: log.ID,
      State: Number(log.State || 0),
      IsSubmit: Number(log.IsSubmit || 0),
      isError: (logTables[0] || []).some(
        (l) => String(l.QuestionID) === String(r.QuestionID),
      ),
      isFavorite: (logTables[1] || []).some(
        (l) => String(l.QuestionID) === String(r.QuestionID),
      ),
      isNote: (logTables[2] || []).some(
        (l) => String(l.QuestionID) === String(r.QuestionID),
      ),
      isMastered: (logTables[3] || []).some(
        (l) => String(l.QuestionID) === String(r.QuestionID),
      ),
    };
  });
  const propertyRows = mathRows(definitions.data);
  const groups = relatedPropertyGroups(propertyRows);
  const years = [
    ...new Set(rows.map((r) => String(r.BookYear || "")).filter(Boolean)),
  ]
    .sort()
    .reverse();
  const filtered = definitions.loading || definitions.error ? [] : rows.filter(
    (r) =>
      (year === "全部" || String(r.BookYear) === year) &&
      (allSubjects || matchesRelatedSubject(r, subject, propertyRows)) &&
      matchesRelatedProperties(r, selectedProperties, propertyRows) &&
      (status === "全部" ||
        (status === "未做" && !r.State) ||
        (status === "做错的" &&
          (r.State === 2 || r.State === 3) &&
          r.IsSubmit === 1) ||
        (status === "收藏的" && r.isFavorite) ||
        (status === "笔记的" && r.isNote) ||
        (status === "已斩" && r.isMastered) ||
        (status === "未斩" && !r.isMastered)),
  );
  const active =
    current !== undefined
      ? filtered.find((r) => Number(r.QuestionID) === current)
      : undefined;
  const activeIndex = active
    ? filtered.findIndex((r) => r.QuestionID === active.QuestionID)
    : -1;
  const summary = {
    done: filtered.filter((r) => r.IsSubmit === 1).length,
    correct: filtered.filter((r) => r.IsSubmit === 1 && r.State === 1).length,
    drafts: filtered.filter((r) => r.State > 0 && !r.IsSubmit),
  };
  const submitAll = async () => {
    const drafts = summary.drafts.filter((r) => r.ExerciseID);
    if (!drafts.length) return;
    setBusy(true);
    setNotice("");
    try {
      await mathPost("/api/rel_question_log/SubmitAll", {
        ids: drafts.map((r) => r.ExerciseID).join(","),
      });
      const wrong = drafts
        .filter((r) => r.State === 2 || r.State === 3)
        .map((r) => ({
          Type: "错题",
          QuestionID: r.QuestionID,
          StuID: stuid,
          BusID: scope,
          ID: 0,
        }));
      if (wrong.length)
        await mathPost("/api/rel_question_log/InnerAll_rel_question_log", {
          Content: JSON.stringify(wrong),
        });
      setLocal((v) =>
        Object.fromEntries(
          Object.entries(v).map(([id, r]) => [id, { ...r, IsSubmit: 1 }]),
        ),
      );
      setNotice(`已提交 ${drafts.length} 道题，结果已保存到当前学习账号`);
      recordStudy({
        platform: "math",
        type: "test-submission",
        title: collection.name,
        path: "/study/practice",
      });
      logs.reload();
    } catch (e: any) {
      setNotice(`提交失败：${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    const ids = filtered.filter((r) => r.ExerciseID).map((r) => r.ExerciseID);
    if (!ids.length) return;
    setBusy(true);
    try {
      await mathPost("/api/rel_question_log/ResetSubmitAll", {
        ids: ids.join(","),
      });
      // The current source endpoint can acknowledge without clearing newer
      // exercise rows. Update only the explicitly confirmed exercise IDs.
      for (const id of ids)
        await mathPost("/api/rel_question_log/Inner_rel_question_log",
          relatedResetPayload(id));
      setLocal({});
      logs.reload();
      setConfirmReset(false);
      setCurrent(undefined);
      setNotice("当前筛选范围的练习已重置，可重新作答。");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={16} />
        返回考点刷题
      </button>
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">PRACTICE BY TOPIC</span>
          <h2>{collection.name}</h2>
          <p>
            当前筛选 {filtered.length} 题 · 已提交 {summary.done} 题 · 正确{" "}
            {summary.correct} 题
          </p>
        </div>
        <select
          className="input mrq-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          aria-label="练习或测试模式"
        >
          <option>练习模式</option>
          <option>测试模式</option>
        </select>
      </div>
      <div className="panel">
        <div className="math-toolbar">
          <span className="math-tag">{allSubjects ? "全部科目" : `${subject}适用 · 含公共考题`}</span>
          <button className="math-text-button" onClick={() => { setAllSubjects(!allSubjects); setCurrent(undefined); setLimit(60); setSelectedProperties({}); }}>{allSubjects ? "回到我的备考目标" : "浏览其他科目"}</button>
          <button
            className="btn btn-secondary"
            onClick={() => setFilterShown(!filterShown)}
          >
            <Filter size={15} />
            题目筛选
          </button>
          <select
            className="input mrq-status"
            aria-label="按学习状态筛选"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCurrent(undefined);
              setLimit(60);
            }}
          >
            {["全部", "未做", "做错的", "收藏的", "笔记的", "已斩", "未斩"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
          {collection.type !== 0 && years.length > 0 && (
            <select
              className="input mrq-status"
              value={year}
              aria-label="书籍包年份"
              onChange={(e) => {
                setYear(e.target.value);
                setCurrent(undefined);
                setLimit(60);
              }}
            >
              <option>全部</option>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          )}
          <button
            className="math-text-button"
            onClick={() => {
              setYear("全部");
              setSelectedProperties({});
              setStatus("全部");
              setCurrent(undefined);
            }}
          >
            清除筛选
          </button>
          <button
            className="math-icon-button"
            aria-label="刷新考点刷题"
            onClick={() => {
              remote.reload();
              logs.reload();
              setLocal({});
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {filterShown && (
          <div className="mrq-filters">
            <State
              loading={definitions.loading}
              error={definitions.error}
              retry={definitions.reload}
            />
            {groups.filter(g => allSubjects || !g.rows.some(isRelatedSubjectScope)).map((g) => (
              <details key={g.id}>
                <summary>
                  {g.name}
                  <span>{selectedProperties[g.id]?.length || "全部"}</span>
                </summary>
                <div className="mrq-property-options">
                  {g.rows.map((p) => (
                    <label key={p.ID}>
                      <input
                        type="checkbox"
                        checked={(selectedProperties[g.id] || []).includes(
                          String(p.ID),
                        )}
                        onChange={() => {
                          setSelectedProperties((v) => ({
                            ...v,
                            [g.id]: (v[g.id] || []).includes(String(p.ID))
                              ? (v[g.id] || []).filter(
                                  (id) => id !== String(p.ID),
                                )
                              : [...(v[g.id] || []), String(p.ID)],
                          }));
                          setLimit(60);
                          setCurrent(undefined);
                        }}
                      />
                      <span>{p.Name}</span>
                    </label>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
        <div className="mrq-summary">
          <span>
            <Check size={15} />
            {summary.done} 已提交
          </span>
          <span>
            <Flag size={15} />
            {summary.drafts.length} 待提交
          </span>
          {mode === "测试模式" && (
            <button
              className="btn btn-primary"
              disabled={busy || !summary.drafts.length}
              onClick={submitAll}
            >
              {busy ? "正在提交…" : "提交本组测试"}
            </button>
          )}
          <button
            className="math-text-button"
            disabled={busy || !summary.done}
            onClick={() => setConfirmReset(true)}
          >
            重置当前练习
          </button>
        </div>
        {notice && (
          <p className="math-account-notice" role="status">
            {notice}
          </p>
        )}
        <State
          loading={remote.loading || logs.loading || definitions.loading}
          error={remote.error || logs.error || definitions.error}
          empty={!remote.loading && !logs.loading && !definitions.loading && !definitions.error && !filtered.length}
          retry={() => {
            remote.reload();
            logs.reload();
            definitions.reload();
          }}
        />
        {!active && (
          <>
            <div className="mrq-question-grid">
              {filtered.slice(0, limit).map((r) => {
                const progress = answerProgress({ saved: !!r.IsSubmit, draft: !!r.State, correct: r.State === 1 ? true : [2, 3].includes(r.State) ? false : undefined });
                return (
                <button
                  key={r.QuestionID}
                  className={`answer-progress-${progress.state}`}
                  aria-label={`第 ${r._number} 题，${progress.label}`}
                  onClick={() => setCurrent(Number(r.QuestionID))}
                >
                  <span className="mrq-number">{r._number}</span>
                  <div>
                    <strong>
                      {r.IsSubmit
                        ? progress.label
                        : r.State
                          ? "待提交"
                          : "开始练习"}
                    </strong>
                    <div className="mrq-tags">
                      {relatedProperties(r)
                        .map((p) =>
                          propertyRows.find(
                            (d) =>
                              String(d.ID) === p.PropertyContentID &&
                              String(d.PropertyID) === p.PropertyID,
                          ),
                        )
                        .filter(Boolean)
                        .slice(0, 3)
                        .map((p, i) => (
                          <span key={i}>{p?.Name}</span>
                        ))}
                    </div>
                  </div>
                  {r.isMastered ? (
                    <Flag size={15} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
              ); })}
            </div>
            {filtered.length > limit && (
              <button
                className="btn btn-secondary math-load-more"
                onClick={() => setLimit((v) => v + 60)}
              >
                加载更多题目
              </button>
            )}
          </>
        )}
      </div>
      {active && (
        <RelatedReader
          key={active.QuestionID}
          row={active}
          stuid={stuid}
          scope={scope}
          mode={mode}
          renderQuestion={renderQuestion}
          prev={
            activeIndex > 0
              ? () => setCurrent(Number(filtered[activeIndex - 1].QuestionID))
              : undefined
          }
          next={
            activeIndex < filtered.length - 1
              ? () => setCurrent(Number(filtered[activeIndex + 1].QuestionID))
              : undefined
          }
          back={() => {
            setCurrent(undefined);
            logs.reload();
          }}
          onSaved={(log) => {
            setLocal((v) => ({ ...v, [active.QuestionID]: log }));
            if (mode === "练习模式") logs.reload();
          }}
        />
      )}
      {confirmReset && (
        <div className="math-modal-backdrop">
          <div
            className="panel math-modal"
            role="dialog"
            aria-modal="true"
            aria-label="重置当前练习"
          >
            <h3>重新练习当前筛选的题目？</h3>
            <p className="math-muted">
              当前范围的作答提交状态将被重置，收藏和笔记会保留。
            </p>
            <div className="math-modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmReset(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={reset}
              >
                {busy ? "重置中…" : "确认重新练习"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function RelatedReader({
  row,
  stuid,
  scope,
  mode,
  renderQuestion,
  prev,
  next,
  back,
  onSaved,
}: {
  row: MathRow;
  stuid: string;
  scope: number;
  mode: string;
  renderQuestion: (props: RelatedReaderProps) => ReactNode;
  prev?: () => void;
  next?: () => void;
  back: () => void;
  onSaved: (log: MathRow) => void;
}) {
  const detail = useData(`related-detail-${row.QuestionID}`, () =>
    Promise.all([
      mathCommand("GetQuestionDetails_rel_zyk", { ID: row.QuestionID }),
      mathCommand("GetUserLogQuestionList_zyk", {
        QuestionID: row.QuestionID,
        StuID: stuid,
        BusID: scope,
        t: Date.now(),
      }),
      mathCommand("GetQuestionLogInfo_rel2", { QuestionID: row.QuestionID }),
    ]),
  );
  const [exercise, setExercise] = useState<MathRow>();
  const [annotation, setAnnotation] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());
  useEffect(() => {
    if (detail.data) {
      const previousNote = mathTables(detail.data[1])[4]?.find(
        (r) => r.Type === "笔记",
      );
      setAnnotation(previousNote?.Content || "");
    }
  }, [detail.data]);
  const publicStats = detail.data ? mathTables(detail.data[2]) : [];
  const crowdDone = Number(
    publicStats[0]?.find((r) => r.Type === "题目")?.counts || 0,
  );
  const crowdFavorites = Number(
    publicStats[0]?.find((r) => r.Type === "收藏")?.counts || 0,
  );
  const crowdRight = Number(publicStats[1]?.[0]?.counts || 0);
  const tables = detail.data ? mathTables(detail.data[1]) : [];
  const previous = exercise || tables[5]?.[0] || {};
  const annotations = tables[4] || [];
  const current = {
    ...row,
    ...previous,
    QuestionID: row.QuestionID,
    _question_list: detail.data ? mathRows(detail.data[0])[0] : {},
  };
  const flag = async (Type: string) => {
    setBusy(true);
    setNotice("");
    try {
      const existing = annotations.find((r) => r.Type === Type);
      if (existing && Type !== "笔记")
        await mathPost("/api/rel_question_log/Del_rel_question_log", {
          ID: existing.ID,
        });
      else
        await mathPost("/api/rel_question_log/Inner_rel_question_log", {
          Type,
          QuestionID: row.QuestionID,
          StuID: stuid,
          BusID: scope,
          ID: existing?.ID || 0,
          ...(Type === "笔记"
            ? {
                Content: annotation || existing?.Content || "",
                ContentImg: existing?.ContentImg || "",
                UpdateColumns: "ID,Content,ContentImg",
              }
            : { UpdateColumns: "ID,Content" }),
        });
      setNotice(
        Type === "笔记"
          ? "题库笔记已保存"
          : existing
            ? `已取消${Type}`
            : `已${Type}`,
      );
      detail.reload();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };
  const answer = async (
    MyAnswer: string,
    correct: boolean,
    details?: { question: MathRow; options: MathRow[] },
  ) => {
    const State = relatedGradeState(details?.options || [], MyAnswer, correct);
    const payload = {
      ActiveOptionIDs: details?.options?.length ? MyAnswer.split(",") : [],
      MyAnswer,
      Type: "题目",
      QuestionID: row.QuestionID,
      StuID: stuid,
      State,
      Notes: Math.max(1, Math.round((Date.now() - started.current) / 1000)),
      IsNew: 1,
      IsSubmit: 0,
      BusID: scope,
      ID: previous.ID || 0,
      UpdateColumns: "ID,ActiveOptionIDs,MyAnswer,State,Notes,IsNew,IsSubmit",
    };
    const saved = await mathPost(
      "/api/rel_question_log/Inner_rel_question_log",
      payload,
    );
    const ID = previous.ID || Number(mathData(saved));
    if (!ID) throw new Error("平台没有确认作答记录，请重试");
    const result = { ...payload, ID };
    if (mode === "练习模式") {
      await mathPost("/api/rel_question_log/Inner_rel_question_log", {
        ID,
        IsSubmit: 1,
        Notes: payload.Notes,
        UpdateColumns: "ID,IsSubmit,Notes",
      });
      result.IsSubmit = 1;
      if (State > 1 && !annotations.some((r) => r.Type === "错题"))
        await mathPost("/api/rel_question_log/Inner_rel_question_log", {
          Type: "错题",
          QuestionID: row.QuestionID,
          StuID: stuid,
          BusID: scope,
          ID: 0,
        });
    }
    setExercise(result);
    onSaved(result);
  };
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回筛选结果
      </button>
      <State
        loading={detail.loading}
        error={detail.error}
        retry={detail.reload}
      />
      {detail.data && (
        <>
          {renderQuestion({
            row: current,
            prev,
            next,
            onAnswered: answer,
            readOnly: Number(previous.IsSubmit) === 1,
          })}
          <div className="panel mrq-annotations">
            {crowdDone > 0 && (
              <p className="math-muted">
                平台答题 {crowdDone} 次 · 正确 {crowdRight} 次 · 正确率{" "}
                {Math.round((crowdRight / crowdDone) * 100)}% · 收藏{" "}
                {crowdFavorites} 次
              </p>
            )}
            <div>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => flag("收藏")}
              >
                <Star size={16} />
                {annotations.some((r) => r.Type === "收藏")
                  ? "取消收藏"
                  : "收藏本题"}
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => flag("斩题")}
              >
                <Flag size={16} />
                {annotations.some((r) => r.Type === "斩题")
                  ? "取消斩题"
                  : "标记斩题，已掌握"}
              </button>
            </div>
            <label className="math-field">
              题库笔记
              <textarea
                className="input"
                value={annotation}
                onChange={(e) => setAnnotation(e.target.value)}
                placeholder={
                  annotations.find((r) => r.Type === "笔记")?.Content ||
                  "记录这道题的解题思路或易错点…"
                }
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={busy || !annotation.trim()}
              onClick={() => flag("笔记")}
            >
              保存题库笔记
            </button>
            {notice && (
              <p className="math-account-notice" role="status">
                {notice}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
