import { loadBookNotes } from "./notebook-data.mjs";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  FileDown,
  Folder,
  FolderPlus,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import RichContent from "../RichContent";
import {
  mathFreshCommand as mathCommand,
  mathGet,
  mathPost,
  mathRows,
  mathTables,
} from "../../platforms/math";
import type { MathRow, NoteKind } from "../../platforms/math";
import { AttachmentInput } from "./MathQuestions";
import {
  moveNotesPayload,
  noteExportLinks,
  noteQuestionRow,
  noteRecordId,
  notePrintHistoryParams,
  noteWasPrinted,
  sortCatalogPayload,
} from "./notebook-model.mjs";
import "./MathNotebook.css";
function useNotes(key: string, load: () => Promise<any>) {
  const [data, setData] = useState<any>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    load()
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
  return { data, loading, error, reload: () => setVersion((n) => n + 1) };
}
export default function MathNotebook({
  stuid,
  initialKind,
  renderQuestion,
}: {
  stuid: string;
  initialKind: NoteKind;
  renderQuestion: (row: MathRow) => ReactNode;
}) {
  const [kind, setKind] = useState<NoteKind>(initialKind),
    [origin, setOrigin] = useState("book"),
    [bank, setBank] = useState(0),
    [subject, setSubject] = useState("数一"),
    [catalog, setCatalog] = useState("0"),
    [book, setBook] = useState("0"),
    [search, setSearch] = useState(""),
    [ascending, setAscending] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [open, setOpen] = useState<MathRow>(),
    [editor, setEditor] = useState<MathRow>(),
    [editingContent, setEditingContent] = useState(""),
    [images, setImages] = useState<string[]>([]),
    [categoryEditor, setCategoryEditor] = useState<{
      ID?: number;
      Name: string;
    }>(),
    [moveTarget, setMoveTarget] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [limit, setLimit] = useState(30),
    [exports, setExports] = useState<
      { name: string; count: number; url: string; recordIds: string[] }[]
    >([]);
  const categories = useNotes(`catalogs:${stuid}:${kind}:${subject}`, () =>
    mathCommand("GetSysUserBookCatalog", {
      StuID: stuid,
      BusType: kind,
      Type: "用户笔记本",
      System_Station_ID: 1,
      BusValue: subject,
    }),
  );
  const books = useNotes(`note-books:${stuid}:${kind}`, () =>
    mathCommand("GetSysUserQuestionBookList", { StuID: stuid, Type: kind }),
  );
  const entries = useNotes(
    `notes:${stuid}:${kind}:${catalog}:${book}:${origin}`,
    () =>
      origin === "book"
        ? loadBookNotes({
            get: mathGet,
            command: mathCommand,
            stuid,
            kind,
            bookId: book,
            catalogId: catalog,
          })
        : mathCommand("GetRelQuestionLogMistakesOrFavoriteList", {
            StuID: stuid,
            Type: kind,
          }),
  );
  const printHistory = useNotes(
    `note-print-history:${stuid}:${catalog}:${origin}`,
    () =>
      mathCommand(
        "GetSysUserRecordPrintList",
        notePrintHistoryParams(stuid, catalog),
      ),
  );
  const printed = mathRows(printHistory.data);
  const catalogs = mathRows(categories.data)
    .filter((r) => r.Name)
    .sort((a, b) => Number(a.Sort || 0) - Number(b.Sort || 0));
  const tables = mathTables(entries.data);
  const sourceRows: MathRow[] =
    origin === "book"
      ? (tables[0] || []).map((row) => {
          const sourceBook = mathRows(books.data).find(
            (book) =>
              Number(book.BookID || book.ID) ===
              Number(row.BookID || row.bookID),
          );
          return {
            ...row,
            bookName:
              row.bookName || sourceBook?.bookName || sourceBook?.BookName,
            CatalogName:
              row.CatalogName ||
              catalogs.find((c) => Number(c.ID) === Number(row.CatalogID))
                ?.Name,
          };
        })
      : tables[bank] || [];
  const rows = sourceRows
    .filter(
      (r) =>
        !search ||
        [
          r.Content,
          r.bookName,
          r.BookName,
          r.QuestionTxt,
          r.CatalogName,
          r.QuestionSort,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const order = String(a.addTime || a.AddTime || "").localeCompare(
        String(b.addTime || b.AddTime || ""),
      );
      return ascending ? order : -order;
    });
  const selectedRows = rows.filter((r) =>
    selected.includes(noteRecordId(r, origin)),
  );
  const currentCatalog = catalogs.find((c) => String(c.ID) === catalog);
  useEffect(() => {
    setKind(initialKind);
  }, [initialKind]);
  useEffect(() => {
    setError("");
  }, [!!categoryEditor, categoryEditor?.ID, editor?.ID]);
  useEffect(() => {
    setSelected([]);
    setOpen(undefined);
    setEditor(undefined);
    setExports([]);
    setLimit(30);
    setConfirmDelete(false);
  }, [kind, origin, bank, catalog, book, stuid]);
  async function act(work: () => Promise<any>, message: string, reload = true) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      if (reload) {
        categories.reload();
        entries.reload();
        books.reload();
        setSelected([]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveCategory() {
    if (!categoryEditor?.Name.trim()) return;
    await act(async () => {
      await mathPost("/api/sys_user_book_catalog/Inner_sys_user_book_catalog", {
        StuID: stuid,
        BusType: kind,
        Type: "用户笔记本",
        System_Station_ID: 1,
        Name: categoryEditor.Name.trim(),
        ...(categoryEditor.ID
          ? { ID: categoryEditor.ID, UpdateColumns: "Name" }
          : {}),
      });
      setCategoryEditor(undefined);
    }, "分类已保存");
  }
  async function reorder(index: number, direction: number) {
    const next = [...catalogs];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    await act(
      () =>
        mathPost(
          "/api/sys_user_book_catalog/InnerAll_sys_user_book_catalog",
          sortCatalogPayload(next),
        ),
      "分类顺序已更新",
    );
  }
  async function removeSelected() {
    if (!selectedRows.length) return;
    await act(async () => {
      await mathPost(
        origin === "book"
          ? "/api/sys_user_book_question/Dels_sys_user_book_question"
          : "/api/rel_question_log/Dels_rel_question_log",
        { ids: selectedRows.map((r) => noteRecordId(r, origin)).join(",") },
      );
      setConfirmDelete(false);
    }, `已删除 ${selectedRows.length} 条${kind}记录`);
  }
  function toggle(id: string) {
    setSelected((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
    setConfirmDelete(false);
    setExports([]);
  }
  function exportNotes() {
    setError("");
    try {
      setExports(
        noteExportLinks(selectedRows, {
          origin,
          kind,
          stuid,
        }),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }
  if (open)
    return (
      <div className="math-workspace">
        <button className="math-back" onClick={() => setOpen(undefined)}>
          <ArrowLeft size={16} />
          返回{kind}记录
        </button>
        {renderQuestion(noteQuestionRow(open, origin))}
      </div>
    );
  return (
    <div className="math-workspace">
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">REVIEW & REFLECTION</span>
          <h2>把易错点，整理成自己的知识</h2>
          <p>分类、复习和批量整理，与数学平台保持同步。</p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            categories.reload();
            entries.reload();
            books.reload();
          }}
        >
          <RefreshCw size={15} />
          刷新记录
        </button>
      </div>
      <div className="panel mn-toolbar">
        <div className="tabs">
          {(["错题", "收藏", "笔记"] as NoteKind[]).map((k) => (
            <button
              className={kind === k ? "active" : ""}
              key={k}
              onClick={() => {
                setKind(k);
                setCatalog("0");
                setBook("0");
              }}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="mn-source">
          <button
            className={origin === "book" ? "active" : ""}
            onClick={() => setOrigin("book")}
          >
            书籍与课程
          </button>
          <button
            className={origin === "bank" ? "active" : ""}
            onClick={() => setOrigin("bank")}
          >
            题库记录
          </button>
        </div>
      </div>
      {origin === "book" ? (
        <div className="mn-layout">
          <aside className="panel mn-catalogs">
            <div className="section-heading">
              <h2>我的分类</h2>
              <button
                className="icon-button"
                aria-label="新增笔记分类"
                onClick={() => setCategoryEditor({ Name: "" })}
              >
                <FolderPlus size={18} />
              </button>
            </div>
            <select
              className="input"
              aria-label="笔记数学类别"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setCatalog("0");
              }}
            >
              {["数一", "数二", "数三"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button
              className={`mn-catalog ${catalog === "0" ? "active" : ""}`}
              onClick={() => setCatalog("0")}
            >
              <Folder size={17} />
              全部分类
            </button>
            {categories.loading ? (
              <div className="mn-small-state">
                <LoaderCircle className="spin" size={17} />
              </div>
            ) : categories.error ? (
              <p className="math-error-text">{categories.error}</p>
            ) : (
              catalogs.map((c, index) => (
                <div className="mn-category-row" key={c.ID}>
                  <button
                    className={`mn-catalog ${catalog === String(c.ID) ? "active" : ""}`}
                    onClick={() => setCatalog(String(c.ID))}
                  >
                    <Folder size={16} />
                    <span>{c.Name}</span>
                    <small>{c.counts ?? ""}</small>
                  </button>
                  <div className="mn-category-actions">
                    <button
                      className="icon-button"
                      aria-label={`上移分类${c.Name}`}
                      disabled={busy || index === 0}
                      onClick={() => void reorder(index, -1)}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`下移分类${c.Name}`}
                      disabled={busy || index === catalogs.length - 1}
                      onClick={() => void reorder(index, 1)}
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`重命名分类${c.Name}`}
                      onClick={() =>
                        setCategoryEditor({ ID: c.ID, Name: c.Name })
                      }
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`删除空分类${c.Name}`}
                      disabled={busy || Number(c.counts) !== 0}
                      title={
                        Number(c.counts) !== 0 ? "先移走或删除分类中的题目" : ""
                      }
                      onClick={() => {
                        if (window.confirm(`删除空分类“${c.Name}”？`))
                          void act(
                            () =>
                              mathPost(
                                "/api/sys_user_book_catalog/Del_sys_user_book_catalog",
                                { ID: c.ID },
                              ),
                            "分类已删除",
                          );
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
            {!categories.loading && !catalogs.length && (
              <p className="mn-help">创建分类，为易错点和笔记留一个位置。</p>
            )}
            <button
              className="btn btn-secondary full-width"
              onClick={() => setCategoryEditor({ Name: "" })}
            >
              <FolderPlus size={15} />
              创建分类
            </button>
          </aside>
          <section className="panel mn-list">
            <div className="mn-filters">
              <select
                className="input"
                aria-label="按笔记书籍筛选"
                value={book}
                onChange={(e) => setBook(e.target.value)}
              >
                <option value="0">全部书籍</option>
                {mathRows(books.data).map((b, i) => (
                  <option value={b.BookID} key={i}>
                    {b.bookName || b.Name || "数学资料"} {b.BusValue || ""}{" "}
                    {b.BookYear || ""}
                  </option>
                ))}
              </select>
              <label className="mn-search">
                <Search size={16} />
                <input
                  className="input"
                  aria-label="搜索笔记内容"
                  placeholder="搜索笔记内容或书名"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelected([]);
                    setLimit(30);
                  }}
                />
              </label>
              <button
                className="text-link"
                onClick={() => setAscending(!ascending)}
              >
                {ascending ? "最早添加" : "最近添加"}
              </button>
            </div>
            {renderList()}
          </section>
        </div>
      ) : (
        <section className="panel mn-list">
          <div className="tabs mn-bank-tabs">
            {["自定义刷题", "推荐刷题", "真题刷题"].map((name, i) => (
              <button
                className={bank === i ? "active" : ""}
                key={name}
                onClick={() => setBank(i)}
              >
                {name}
              </button>
            ))}
          </div>
          {renderList()}
        </section>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {categoryEditor && (
        <div
          className="math-modal-backdrop"
          onClick={() => !busy && setCategoryEditor(undefined)}
        >
          <form
            className="panel math-modal"
            role="dialog"
            aria-modal="true"
            aria-label={categoryEditor.ID ? "重命名分类" : "创建笔记分类"}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void saveCategory();
            }}
          >
            <div className="math-modal-heading">
              <h3>{categoryEditor.ID ? "重命名分类" : "创建新分类"}</h3>
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                aria-label="关闭分类编辑"
                onClick={() => setCategoryEditor(undefined)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="field-label">
              分类名称
              <input
                className="input"
                autoFocus
                value={categoryEditor.Name}
                onChange={(e) =>
                  setCategoryEditor({ ...categoryEditor, Name: e.target.value })
                }
                maxLength={60}
                required
              />
            </label>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn btn-primary full-width"
              disabled={busy || !categoryEditor.Name.trim()}
            >
              {busy ? "正在保存…" : "保存分类"}
            </button>
          </form>
        </div>
      )}
      {editor && (
        <div
          className="math-modal-backdrop"
          onClick={() => !busy && setEditor(undefined)}
        >
          <section
            className="panel math-modal"
            role="dialog"
            aria-modal="true"
            aria-label="编辑学习笔记"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="math-modal-heading">
              <h3>编辑这条{kind}</h3>
              <button
                className="icon-button"
                disabled={busy}
                aria-label="关闭笔记编辑"
                onClick={() => setEditor(undefined)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="field-label">
              我的思考
              <textarea
                className="input"
                rows={6}
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
              />
            </label>
            <AttachmentInput value={images} onChange={setImages} max={3} />
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn btn-primary full-width"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await mathPost(
                    "/api/sys_user_book_question/Inner_sys_user_book_question",
                    {
                      ID: editor.ID,
                      StuID: stuid,
                      Content: editingContent,
                      ContentImg: images.join(","),
                      UpdateColumns: "ID,Content,ContentImg",
                    },
                  );
                  setEditor(undefined);
                }, "笔记内容已保存")
              }
            >
              {busy ? "正在同步…" : "保存到平台"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
  function renderList() {
    return (
      <>
        {printHistory.error && (
          <p className="math-error-text" role="alert">
            打印历史读取失败：{printHistory.error}
            <button className="math-text-button" onClick={printHistory.reload}>
              重新读取打印历史
            </button>
          </p>
        )}
        <div className="mn-batch">
          <label>
            <input
              type="checkbox"
              checked={!!rows.length && selectedRows.length === rows.length}
              disabled={!rows.length || busy}
              onChange={() => {
                setSelected(
                  selectedRows.length === rows.length
                    ? []
                    : rows.map((r) => noteRecordId(r, origin)),
                );
                setExports([]);
              }}
            />
            全选
          </label>
          <span>
            {selectedRows.length} 项已选 · {rows.length} 条记录
            {currentCatalog ? ` · ${currentCatalog.Name}` : ""}
          </span>
          {origin === "book" && (
            <>
              <select
                className="input"
                aria-label="批量移动到分类"
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
              >
                <option value="">选择目标分类</option>
                {catalogs.map((c) => (
                  <option key={c.ID} value={c.ID}>
                    {c.Name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                disabled={busy || !selectedRows.length || !moveTarget}
                onClick={() =>
                  void act(
                    () =>
                      mathPost(
                        "/api/sys_user_book_question/Updatesys_user_book_question",
                        moveNotesPayload(
                          selectedRows.map((r) => noteRecordId(r, origin)),
                          moveTarget,
                        ),
                      ),
                    "所选记录已移动",
                  )
                }
              >
                移动
              </button>
            </>
          )}
          <button
            className="icon-button"
            disabled={
              !selectedRows.length ||
              busy
            }
            aria-label="导出所选记录PDF"
            title="导出所选记录PDF"
            onClick={exportNotes}
          >
            <FileDown size={17} />
          </button>
          <button
            className="icon-button"
            disabled={!selectedRows.length || busy}
            aria-label="删除所选记录"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={17} />
          </button>
        </div>
        {confirmDelete && (
          <div className="error-banner">
            <span>
              确认删除选中的 {selectedRows.length} 条{kind}记录？
            </span>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              取消
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void removeSelected()}
            >
              确认删除
            </button>
          </div>
        )}
        {exports.length > 0 && (
          <div className="mn-export">
            <h3>平台 PDF 导出</h3>
            <p>
              按所选记录生成下载链接，记录较多时会拆成多个文件。
            </p>
            {exports.map((file, i) => <a className="btn btn-secondary" href={file.url} target="_blank" rel="noreferrer" key={i}><FileDown size={15} />打开 · {file.name} · {file.count} 题</a>)}
          </div>
        )}
        {entries.loading ? (
          <div className="math-state">
            <LoaderCircle className="spin" />
            <p>正在读取个人记录…</p>
          </div>
        ) : entries.error ? (
          <div className="error-banner">
            <span>{entries.error}</span>
            <button className="text-link" onClick={entries.reload}>
              重试
            </button>
          </div>
        ) : !rows.length ? (
          <div className="empty-state">
            <BookOpen size={30} />
            <h3>这里还没有{kind}记录</h3>
            <p>学习时标记一道题，或换个分类继续查找。</p>
          </div>
        ) : (
          rows.slice(0, limit).map((r, index) => {
            const id = noteRecordId(r, origin),
              title =
                r.bookName ||
                r.BookName ||
                r.Name ||
                `第 ${r.QuestionSort || r.QuestionID || r.QID || index + 1} 题`;
            return (
              <article className="mn-entry" key={`${id}-${index}`}>
                <input
                  type="checkbox"
                  aria-label={`选择${title}`}
                  checked={selected.includes(id)}
                  onChange={() => toggle(id)}
                />
                <span className="mn-entry-icon">
                  {kind === "收藏" ? (
                    <Star size={19} />
                  ) : (
                    <BookOpen size={19} />
                  )}
                </span>
                <div className="mn-entry-content">
                  <p className="math-tag">
                    {r.CatalogName || r.Source || r.Json || kind}
                  </p>
                  <h3>{title}</h3>
                  <RichContent
                    content={
                      r.Content || r.QuestionTxt || r.QuestionContent || ""
                    }
                  />
                  <div className="mn-images">
                    {(Array.isArray(r.ContentImg)
                      ? r.ContentImg
                      : String(r.ContentImg || "").split(",")
                    )
                      .filter(Boolean)
                      .map(
                        (url: string, i: number) =>
                          /^https?:\/\//.test(url) && (
                            <a
                              href={url}
                              key={i}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img src={url} alt="笔记图片" loading="lazy" />
                            </a>
                          ),
                      )}
                  </div>
                  <small>
                    {String(r.addTime || r.AddTime || "")
                      .replace("T", " ")
                      .slice(0, 16)}
                  </small>
                  {noteWasPrinted(r, printed, origin) && (
                    <span className="math-tag">已有打印记录</span>
                  )}
                  <div className="mn-entry-actions">
                    <button className="text-link" onClick={() => setOpen(r)}>
                      查看题目
                    </button>
                    {origin === "book" && (
                      <button
                        className="text-link"
                        onClick={() => {
                          setEditor(r);
                          setEditingContent(r.Content || "");
                          setImages(
                            (Array.isArray(r.ContentImg)
                              ? r.ContentImg
                              : String(r.ContentImg || "").split(",")
                            ).filter(Boolean),
                          );
                        }}
                      >
                        <Pencil size={12} />
                        编辑{kind}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
        {rows.length > limit && (
          <button
            className="btn btn-secondary math-load-more"
            onClick={() => setLimit((n) => n + 30)}
          >
            加载更多记录
          </button>
        )}
      </>
    );
  }
}
