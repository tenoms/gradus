import { useMathLearningPlan } from "./MathLearningPlan";
import { matchesMathSubject } from "./learning-plan-model.mjs";
import { useEffect, useRef, useState } from "react";
import { invalidateCatalogResources } from "../../lib/api";
import Pagination from "../Pagination";
import { usePagination } from "../../lib/pagination";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { mathImage, mathTitle } from "../../platforms/math";
import { mathLibraryTag, mathLibraryTagOptions, matchesMathLibraryTag } from "../../platforms/math-library";
import MathLibraryTagFilter from "./MathLibraryTagFilter";
import {
  bookshelfApi,
  changeShelfIds,
  shelfField,
  shelfIds,
  shelfProgress,
  shelfRows,
  shelfLastQuestion,
} from "./math-bookshelf";
import type { ShelfRow as R } from "./math-bookshelf";
import "./math-bookshelf.css";

export default function MathBookshelf({
  stuid,
  onOpenBook,
}: {
  stuid: string;
  onOpenBook: (book: R, lastQuestion?: Promise<R | undefined>) => void;
}) {
  const catalogRef = useRef<HTMLDivElement>(null);
  const { subject } = useMathLearningPlan();
  const [data, setData] = useState<{
      user: R;
      books: R[];
      shelf: R[];
      recent: R[];
      progress: R[];
    } | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0),
    [tab, setTab] = useState("shelf"),
    [kind, setKind] = useState("全部"),
    [tag, setTag] = useState(""),
    [allSubjects, setAllSubjects] = useState(false),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [managing, setManaging] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    bookshelfApi
      .load(stuid)
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
  }, [stuid, version]);
  useEffect(() => setTag(""), [subject]);
  const selectedIds = [
      ...shelfIds(data?.user.EBookIDs),
      ...shelfIds(data?.user.PaperIDs),
    ],
    all =
      tab === "library"
        ? data?.books || []
        : tab === "recent"
          ? data?.recent || []
          : data?.shelf || [],
    scoped = all.filter(
      (row) =>
        matchesMathLibraryTag(row, kind) &&
        (allSubjects || matchesMathSubject(row, subject)) &&
        (!search ||
          [
            row.Name,
            row.BookName,
            row.Author,
            row.BookAuthor,
            row.TeacherName,
            row.BookYear,
            mathLibraryTag(row),
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())),
    );
  const tagOptions = mathLibraryTagOptions(scoped, kind),
    rows = scoped.filter(row => matchesMathLibraryTag(row, kind, tag));
  const pagination = usePagination({
    total: rows.length,
    pageSize: 24,
    resetKey: JSON.stringify([stuid, tab, kind, tag, subject, allSubjects, search]),
  });
  async function add(book: R) {
    if (!data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const field = shelfField(book),
        next = changeShelfIds(data.user[field], [book.ID]);
      await bookshelfApi.update(data.user, field, next);
      setData((d) =>
        d
          ? {
              ...d,
              user: { ...d.user, [field]: next },
              shelf: [
                ...d.shelf.filter((b) => String(b.ID) !== String(book.ID)),
                book,
              ],
            }
          : d,
      );
      setNotice("已加入书架");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!data || !selected.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let nextUser = { ...data.user };
      for (const field of ["EBookIDs", "PaperIDs"] as const) {
        const ids = selected.filter((id) =>
          shelfIds(data.user[field]).includes(id),
        );
        if (ids.length) {
          const next = changeShelfIds(data.user[field], ids, true);
          await bookshelfApi.update(data.user, field, next);
          nextUser = { ...nextUser, [field]: next };
          setData((d) =>
            d
              ? {
                  ...d,
                  user: { ...d.user, [field]: next },
                  shelf: d.shelf.filter((b) => !ids.includes(String(b.ID))),
                }
              : d,
          );
        }
      }
      setSelected([]);
      setManaging(false);
      setNotice("已从书架移除，原有学习记录仍可继续查看。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function read(book: R) {
    onOpenBook(book, bookshelfApi.lastQuestion(stuid, book.ID).then(response =>
      shelfLastQuestion(shelfRows(response)[0]),
    ));
  }
  return (
    <div className="math-bookshelf">
      <div className="bookshelf-heading">
        <h2>我的书架</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setTab("library");
            setTag("");
          }}
        >
          <Plus size={16} />
          添加书籍
        </button>
      </div>
      <div className="panel">
        <div className="bookshelf-toolbar">
          <div className="tabs">
            {[
              ["shelf", "我的书架"],
              ["recent", "最近阅读"],
              ["library", "书籍库"],
            ].map(([id, title]) => (
              <button
                className={tab === id ? "active" : ""}
                key={id}
                onClick={() => {
                  setTab(id);
                  setTag("");
                  setManaging(false);
                  setSelected([]);
                }}
              >
                {title}
              </button>
            ))}
          </div>
          <label className="bookshelf-search">
            <Search size={16} />
            <input
              placeholder="搜索书名、作者、标签、年份"
              aria-label="搜索我的数学书架"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            className="bookshelf-icon"
            aria-label="刷新书架"
            onClick={() => { invalidateCatalogResources(); setVersion((v) => v + 1); }}
            disabled={loading || busy}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <div className="bookshelf-filters">
          <select
            className="input"
            aria-label="筛选书籍类型"
            value={kind}
            onChange={(e) => { setKind(e.target.value); setTag(""); }}
          >
            {["全部", "教辅", "真题"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <button className="math-text-button" onClick={() => setAllSubjects(!allSubjects)}>{allSubjects ? "全部科目 · 回到我的目标" : `${subject} · 浏览全部科目`}</button>
          <span>{rows.length} 份资料</span>
          {tab === "shelf" && !!data?.shelf.length && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setManaging(!managing);
                setSelected([]);
              }}
            >
              {managing ? "完成管理" : "管理书架"}
            </button>
          )}
        </div>
        {!loading && !error && <MathLibraryTagFilter kind={kind} options={tagOptions} value={tag} onChange={setTag} />}
        {loading && (
          <div className="bookshelf-status" role="status">
            <LoaderCircle size={22} className="spin" />
            正在同步书架与学习进度…
          </div>
        )}
        {error && (
          <div className="bookshelf-error" role="alert">
            {error}
            <button
              className="btn btn-secondary"
              onClick={() => setVersion((v) => v + 1)}
            >
              重新加载
            </button>
          </div>
        )}
        {notice && (
          <p className="bookshelf-notice" role="status">
            {notice}
          </p>
        )}
        {!loading && !error && !rows.length && (
          <div className="empty-state">
            <BookOpen size={31} />
            <h3>
              {all.length ? "当前筛选下没有资料" : tab === "shelf"
                ? "书架还是空的"
                : tab === "recent"
                  ? "还没有最近阅读记录"
                  : "当前筛选下没有资料"}
            </h3>
            <p>
              {all.length ? "可切换标签、调整关键词或浏览其他科目。" : tab === "shelf"
                ? "从书籍库加入常用教辅或试卷，开始安排学习。"
                : tab === "recent" ? "学习后，这里会显示真实阅读进度。" : "平台暂未返回资料，可稍后刷新。"}
            </p>
            {all.length ? <button className="btn btn-secondary" onClick={() => { setKind("全部"); setTag(""); setSearch(""); }}>清除筛选</button> : tab !== "library" && (
              <button
                className="btn btn-primary"
                onClick={() => { setTab("library"); setTag(""); }}
              >
                去书籍库
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        )}
        <div className="bookshelf-grid pagination-content" ref={catalogRef}>
          {rows.slice(pagination.start, pagination.end).map((book, index) => {
            const id = String(book.ID),
              plan = data?.progress.find((p) => String(p.ID) === id) || book,
              progress = shelfProgress(plan),
              inShelf = selectedIds.includes(id),
              chosen = selected.includes(id);
            return (
              <article
                className={`bookshelf-card ${chosen ? "selected" : ""}`}
                key={`${id}-${index}`}
              >
                <button
                  className="bookshelf-cover"
                  disabled={busy}
                  onClick={() =>
                    managing
                      ? setSelected((ids) =>
                          chosen ? ids.filter((v) => v !== id) : [...ids, id],
                        )
                      : void read(book)
                  }
                  aria-label={
                    managing
                      ? `选择${mathTitle(book)}`
                      : `阅读${mathTitle(book)}`
                  }
                >
                  {mathImage(book.HeadImg) ? (
                    <img src={mathImage(book.HeadImg)} alt="" loading="lazy" />
                  ) : (
                    <div>
                      <span>{book.BusValue || "数学学习"}</span>
                      <BookOpen size={33} />
                      <strong>{book.BookYear || "MATH"}</strong>
                    </div>
                  )}
                  {managing && (
                    <span
                      className={`bookshelf-check ${chosen ? "active" : ""}`}
                    >
                      {chosen && <Check size={14} />}
                    </span>
                  )}
                </button>
                <span className="bookshelf-tag">
                  {mathLibraryTag(book)}
                </span>
                <h3>{mathTitle(book)}</h3>
                <p>
                  {book.Author ||
                    book.BookAuthor ||
                    book.TeacherName ||
                    "数学学习资料"}
                </p>
                {tab !== "library" && (
                  <>
                    <div className="bookshelf-progress">
                      <span style={{ width: `${progress.percent}%` }} />
                    </div>
                    <div className="bookshelf-progress-label">
                      <span>{progress.percent}% 已学</span>
                      <span>
                        {progress.read}/{progress.total || "—"} 题
                      </span>
                    </div>
                    {plan.maxaddtime && (
                      <p className="bookshelf-last">
                        <Clock3 size={11} />
                        {String(plan.maxaddtime).replace("T", " ").slice(0, 16)}
                      </p>
                    )}
                  </>
                )}
                <div className="bookshelf-card-actions">
                  {tab === "library" && !inShelf ? (
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => void add(book)}
                    >
                      <Plus size={14} />
                      加入书架
                    </button>
                  ) : (
                    <button
                      className="bookshelf-read"
                      disabled={busy || managing}
                      onClick={() => void read(book)}
                    >
                      继续阅读
                      <ArrowRight size={14} />
                    </button>
                  )}
                  {inShelf && tab === "library" && (
                    <span className="bookshelf-in-shelf">
                      <Check size={13} />
                      已在书架
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!loading && !error && (
          <Pagination
            label="数学书架"
            contentRef={catalogRef}
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={rows.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={[12, 24, 48]}
            disabled={busy}
          />
        )}
        {managing && (
          <div className="bookshelf-manage">
            <span>已选择 {selected.length} 本</span>
            <button
              className="btn btn-secondary"
              onClick={() =>
                setSelected((previous) => [
                  ...new Set([
                    ...previous,
                    ...rows.slice(pagination.start, pagination.end).map((r) => String(r.ID)),
                  ]),
                ])
              }
            >
              全选本页
            </button>
            <button
              className="btn btn-primary"
              disabled={!selected.length || busy}
              onClick={() => {
                if (
                  window.confirm(
                    `从书架移除已选择的 ${selected.length} 本资料？`,
                  )
                )
                  void remove();
              }}
            >
              <Trash2 size={15} />
              移出书架
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
