import { useEffect, useState } from "react";
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
  onOpenBook: (book: R, lastQuestion?: R) => void;
}) {
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
    [subject, setSubject] = useState("全部"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [managing, setManaging] = useState(false),
    [limit, setLimit] = useState(24);
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
    rows = all.filter(
      (row) =>
        (kind === "全部" ||
          (kind === "教辅"
            ? row.BusType !== "试卷"
            : row.BusType === "试卷")) &&
        (subject === "全部" ||
          row.BusValue === subject ||
          row.BusValue === "通用") &&
        (!search ||
          [
            row.Name,
            row.BookName,
            row.Author,
            row.BookAuthor,
            row.TeacherName,
            row.BookYear,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())),
    );
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
  async function read(book: R) {
    setBusy(true);
    setError("");
    try {
      const last = shelfRows(
        await bookshelfApi.lastQuestion(stuid, book.ID),
      )[0];
      onOpenBook(book, shelfLastQuestion(last));
    } catch (e: any) {
      setError(`上次阅读位置暂未读取：${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="math-bookshelf">
      <div className="panel bookshelf-heading">
        <div>
          <span className="bookshelf-eyebrow">MY STUDY SHELF</span>
          <h2>把常用的书，放在手边</h2>
          <p>书架、真实学习进度与最近阅读位置同步到数学账号。</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setTab("library");
            setLimit(24);
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
                  setManaging(false);
                  setSelected([]);
                  setLimit(24);
                }}
              >
                {title}
              </button>
            ))}
          </div>
          <label className="bookshelf-search">
            <Search size={16} />
            <input
              placeholder="搜索书名、作者、年份"
              aria-label="搜索我的数学书架"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(24);
              }}
            />
          </label>
          <button
            className="bookshelf-icon"
            aria-label="刷新书架"
            onClick={() => setVersion((v) => v + 1)}
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
            onChange={(e) => {
              setKind(e.target.value);
              setLimit(24);
            }}
          >
            {["全部", "教辅", "真题"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            className="input"
            aria-label="筛选数学类别"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setLimit(24);
            }}
          >
            {["全部", "数一", "数二", "数三"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
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
              {tab === "shelf"
                ? "书架还是空的"
                : tab === "recent"
                  ? "还没有最近阅读记录"
                  : "当前筛选下没有资料"}
            </h3>
            <p>
              {tab === "shelf"
                ? "从书籍库加入常用教辅或试卷，开始安排学习。"
                : "学习后，这里会显示真实阅读进度。"}
            </p>
            {tab !== "library" && (
              <button
                className="btn btn-primary"
                onClick={() => setTab("library")}
              >
                去书籍库
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        )}
        <div className="bookshelf-grid">
          {rows.slice(0, limit).map((book, index) => {
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
                  {book.BusType === "试卷"
                    ? "历年真题"
                    : book.BusValue || "数学教辅"}
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
        {rows.length > limit && (
          <button
            className="btn btn-secondary bookshelf-more"
            onClick={() => setLimit((v) => v + 24)}
          >
            加载更多
          </button>
        )}
        {managing && (
          <div className="bookshelf-manage">
            <span>已选择 {selected.length} 本</span>
            <button
              className="btn btn-secondary"
              onClick={() => setSelected(rows.map((r) => String(r.ID)))}
            >
              全选当前列表
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
