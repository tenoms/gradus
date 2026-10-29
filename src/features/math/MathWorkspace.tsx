import { answerProgress } from "../learning/workbench/answer-progress.mjs";
import "../learning/workbench/answer-progress.css";
import Pagination from "../../shared/ui/pagination/Pagination";
import { usePagination } from "../../shared/ui/pagination/use-pagination";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { invalidateCatalogResources } from "../../shared/api/client";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  FileText,
  HelpCircle,
  LoaderCircle,
  MessageSquare,
  Play,
  Printer,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import ImportedReportSummary from "../identity/ImportedReportSummary";
import MathLearningPlan, { useMathLearningPlan } from "./preparation/MathLearningPlan";
import { matchesMathSubject } from "./preparation/learning-plan-model.mjs";
import MathBookshelf from "./library/MathBookshelf";
import MathLibraryTagFilter from "./library/MathLibraryTagFilter";
import { mathLibraryTag, mathLibraryTagOptions, matchesMathLibraryTag } from "./library/math-library";
import { useSession } from "../../shared/auth/session";
import { recordStudy } from "../learning/state/store";
import {
  mathApi,
  mathCommand,
  mathPost,
  mathData,
  mathImage,
  mathQuestionId,
  mathRows,
  mathTables,
  mathTitle,
} from "./api/math";
import type { MathRow, NoteKind } from "./api/math";
import "./MathWorkspace.css";

const QuestionReader = lazy(() => import("./questions/MathQuestionReader"));
const RichContent = lazy(() => import("../../shared/content/RichContent"));
const MathNoteEditor = lazy(() => import("./notebook/MathNoteEditor"));
const MathNotebook = lazy(() => import("./notebook/MathNotebook"));
const MathSchools = lazy(() => import("./schools/MathSchools"));
const MathMessages = lazy(() => import("./community/MathMessages"));
const MathSchoolAnalysis = lazy(() => import("./schools/MathSchoolAnalysis"));
const MathHighScoreGuide = lazy(() => import("./practice/MathHighScoreGuide"));
const MathQrcodeLookup = lazy(() => import("./library/MathQrcodeLookup"));
const MathInformationResources = lazy(() => import("./resources/MathInformationResources"));
const MathCourses = lazy(() => import("./courses/MathCourses"));
const MathExams = lazy(() => import("./exams/MathExams"));
const MathAlbums = lazy(() => import("./practice/MathAlbums"));
const MathRelatedQuestions = lazy(() => import("./questions/MathRelatedQuestions"));
const MathPhotoSearch = lazy(() => import("./library/MathPhotoSearch"));
const MathComputing = lazy(() => import("./practice/MathComputing"));
const MathScoreRank = lazy(() => import("./profile/MathScoreRank"));
const MathDiscussion = lazy(() => import("./community/MathDiscussion"));
const MathDiscussionInbox = lazy(() => import("./community/MathDiscussion").then(module => ({ default: module.MathDiscussionInbox })));
const MathQuestions = lazy(() => import("./community/MathQuestions"));
const NewMathQuestion = lazy(() => import("./community/MathQuestions").then(module => ({ default: module.NewMathQuestion })));

function useRemote<T>(key: string, load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    load()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message || "请求失败，请稍后重试");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, version]);
  return { data, error, loading, reload: () => { invalidateCatalogResources(); setVersion((v) => v + 1); } };
}
function State({
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
      <div className="math-state">
        <LoaderCircle className="spin" size={22} />
        <p>正在读取数学学习内容…</p>
      </div>
    );
  if (error)
    return (
      <div className="math-state math-error">
        <p>{error}</p>
        {reload && (
          <button className="btn btn-secondary" onClick={reload}>
            <RefreshCw size={15} />
            重新加载
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="math-state">
        <BookOpen size={28} />
        <p>暂无可用内容</p>
        <small>平台尚未返回当前分类的数据，可切换分类或稍后重试。</small>
      </div>
    );
  return null;
}
function msg(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function valueText(value: unknown) {
  return value == null
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
const safeUrl = (v: unknown) =>
  typeof v === "string" && /^https?:\/\//i.test(v) ? v : "";

export default function MathWorkspace({ section }: { section: string }) {
  const { session, openLogin } = useSession();
  const platform = session.platforms.math;
  const learnerId = session.user?.id || "";
  const user = { ...platform.user, ID: learnerId, StuID: learnerId };
  const stuid = learnerId;
  if (!session.authenticated) return <div className="panel math-connect"><h2>登录学习空间</h2><p>使用你的账号查看数学内容与学习记录。</p><button className="btn btn-primary" onClick={openLogin}>登录学习空间</button></div>;
  let content;
  if (section === "practice") content = <PracticeCenter stuid={stuid} />;
  else if (section === "review" || section === "notes")
    content = (
      <MathNotebook
        stuid={stuid}
        initialKind={section === "review" ? "错题" : "笔记"}
        renderQuestion={(row) => <QuestionReader row={row} stuid={stuid} />}
      />
    );
  else if (section === "community")
    content = <Community stuid={stuid} userId={learnerId} />;
  else if (section === "courses") content = <MathCourses stuid={stuid} />;
  else if (section === "exams") content = <MathExams stuid={stuid} />;
  else if (section === "schools") content = <SchoolCenter stuid={stuid} />;
  else if (section === "resources") content = <ResourceCenter stuid={stuid} />;
  else content = <Library stuid={stuid} />;
  return (
    <MathLearningPlan key={`${session.user?.id}-${stuid}`}><div className="math-workspace">
      <Suspense fallback={<State loading />}>{content}</Suspense>
    </div></MathLearningPlan>
  );
}

function Library({ stuid }: { stuid: string }) {
  const catalogRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const [kind, setKind] = useState("全部");
  const [tag, setTag] = useState("");
  const { subject } = useMathLearningPlan();
  const [allSubjects, setAllSubjects] = useState(false);
  const [year, setYear] = useState("全部");
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [book, setBook] = useState<MathRow>();
  const [photoShown, setPhotoShown] = useState(false);
  const [shelfShown, setShelfShown] = useState(!searchParams.get("q")?.trim());
  const [qrShown, setQrShown] = useState(false);
  const [qrQuestion, setQrQuestion] = useState<MathRow>();
  const remote = useRemote(`math-books-${shelfShown ? "shelf" : "catalog"}`, () =>
    shelfShown ? Promise.resolve({ data: [] }) : mathApi.books(),
  );
  const rows = mathRows(remote.data);
  useEffect(() => {
    setSearch(searchParams.get("q") || "");
    setTag("");
    setKind("全部");
    setYear("全部");
    setBook(undefined);
    setShelfShown(!searchParams.get("q")?.trim());
    setPhotoShown(false);
    setQrShown(false);
    setQrQuestion(undefined);
  }, [searchParams]);
  useEffect(() => setTag(""), [subject]);
  const years = [
    ...new Set(rows.map((r) => String(r.BookYear || "")).filter(Boolean)),
  ]
    .sort()
    .reverse();
  const scopedRows = rows.filter(
    (r) =>
      (allSubjects || matchesMathSubject(r, subject)) &&
      (year === "全部" || String(r.BookYear) === year),
  );
  const searchedRows = scopedRows.filter(
    (r) => !search ||
        [r.Name, r.Author, r.BookAuthor, r.TeacherName, r.BusValue, r.BookYear, mathLibraryTag(r)]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
  );
  const tags = mathLibraryTagOptions(searchedRows, kind);
  const filtered = searchedRows.filter((r) => matchesMathLibraryTag(r, kind, tag));
  const pagination = usePagination({
    total: filtered.length,
    pageSize: 36,
    resetKey: JSON.stringify([kind, tag, subject, allSubjects, year, search]),
  });
  if (qrQuestion)
    return (
      <div className="math-workspace">
        <button className="math-back" onClick={() => setQrQuestion(undefined)}>
          <ArrowLeft size={15} />
          返回二维码内容
        </button>
        <QuestionReader row={qrQuestion} stuid={stuid} />
      </div>
    );
  if (qrShown)
    return (
      <MathQrcodeLookup
        back={() => setQrShown(false)}
        onQuestion={setQrQuestion}
      />
    );
  if (book)
    return (
      <BookWorkspace
        book={book}
        stuid={stuid}
        back={() => setBook(undefined)}
        backLabel={shelfShown ? "返回我的书架" : "返回教辅与真题"}
      />
    );
  if (photoShown)
    return <PhotoSearch stuid={stuid} back={() => setPhotoShown(false)} />;
  if (shelfShown)
    return (
      <div className="math-workspace">
        <div className="panel math-toolbar">
          <button className="btn btn-secondary" onClick={() => setShelfShown(false)}>
            <BookOpen size={16} />浏览教辅与真题
          </button>
          <button className="btn btn-secondary" onClick={() => setQrShown(true)}>书籍二维码</button>
          <button className="btn btn-secondary" onClick={() => setPhotoShown(true)}><Camera size={16} />图片搜题</button>
        </div>
        <MathBookshelf
          stuid={stuid}
          onOpenBook={(selected, lastQuestion) =>
            setBook({ ...selected, _resumeQuestion: lastQuestion })
          }
        />
      </div>
    );
  return (
    <div className="math-workspace">
      <div className="panel math-library">
        <div className="math-toolbar">
          <div className="tabs">
            {["全部", "教辅", "真题"].map((t) => (
              <button
                key={t}
                className={kind === t ? "active" : ""}
                onClick={() => { setKind(t); setTag(""); }}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setShelfShown(true)}
          >
            <BookOpen size={16} />
            我的书架
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setQrShown(true)}
          >
            书籍二维码
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setPhotoShown(true)}
          >
            <Camera size={16} />
            图片搜题
          </button>
          <label className="math-search">
            <Search size={17} />
            <input
              aria-label="搜索教辅和真题"
              placeholder="搜索书名、作者…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="math-filters">
          <span>学习范围</span>
          <button className="math-text-button" onClick={() => setAllSubjects(!allSubjects)}>{allSubjects ? "全部科目 · 回到我的目标" : `${subject}与通用资料 · 浏览全部科目`}</button>
          <select
            aria-label="资料年份"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option>全部</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <span className="math-count">{filtered.length} 份学习资料</span>
          <button
            className="math-icon-button"
            aria-label="刷新教辅"
            onClick={remote.reload}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <MathLibraryTagFilter kind={kind} options={tags} value={tag} onChange={setTag} />
        <State
          loading={remote.loading}
          error={remote.error}
          empty={!remote.loading && !remote.error && !filtered.length}
          reload={remote.reload}
        />
        <div className="math-book-grid pagination-content" ref={catalogRef}>
          {filtered.slice(pagination.start, pagination.end).map((r, i) => (
            <button
              key={`${r.ID}-${i}`}
              className="math-book-card"
              onClick={() => setBook(r)}
            >
              <div className={`math-cover math-cover-${(pagination.start + i) % 4}`}>
                {mathImage(r.HeadImg) ? (
                  <img src={mathImage(r.HeadImg)} alt="" loading="lazy" />
                ) : (
                  <>
                    <span>{r.BusValue || "考研数学"}</span>
                    <BookOpen size={38} />
                    <strong>{r.BookYear || "MATH"}</strong>
                  </>
                )}
              </div>
              <div className="math-book-copy">
                <div className="math-tag">
                  {mathLibraryTag(r)}
                </div>
                <h3>{mathTitle(r)}</h3>
                <p>
                  {r.Author ||
                    r.BookAuthor ||
                    r.PublishingHouse ||
                    "查看题目与解析"}
                </p>
                <span className="math-book-link">
                  进入学习
                  <ArrowRight size={14} />
                </span>
              </div>
            </button>
          ))}
        </div>
        {!remote.loading && !remote.error && (
          <Pagination
            label="数学资料"
            contentRef={catalogRef}
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={filtered.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={[12, 24, 36, 60]}
          />
        )}
      </div>
    </div>
  );
}

function BookWorkspace({
  book,
  stuid,
  back,
  backLabel = "返回资料库",
}: {
  book: MathRow;
  stuid: string;
  back: () => void;
  backLabel?: string;
}) {
  const catalog = useRemote(`book-${book.ID}`, () =>
    mathApi.bookCatalog(book.ID),
  );
  const [current, setCurrent] = useState<MathRow>();
  const [resumeError, setResumeError] = useState("");
  useEffect(() => {
    if (!book._resumeQuestion) return;
    let active = true;
    Promise.resolve(book._resumeQuestion).then((row: MathRow | undefined) => {
      if (active && row) setCurrent(selected => selected || row);
    }).catch(() => {
      if (active) setResumeError("上次阅读位置暂未读取，可直接从目录选题。");
    });
    return () => { active = false; };
  }, [book.ID, book._resumeQuestion]);
  const [searchPage, setSearchPage] = useState("");
  const [searchNumber, setSearchNumber] = useState("");
  const [searchResults, setSearchResults] = useState<MathRow[]>();
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState("");
  const rows = mathRows(catalog.data);
  const shown = (searchResults || rows).filter(
    (r) =>
      !filter ||
      [r.ChapterName, r.QuestionPage, r.QuestionSort, r.Name]
        .join(" ")
        .includes(filter),
  );
  const catalogPagination = usePagination({
    total: shown.length,
    pageSize: 30,
    resetKey: JSON.stringify([book.ID, filter, searchResults?.map(mathQuestionId)]),
  });
  const selectQuestion = (row: MathRow, reveal = false) => {
    setCurrent(row);
    if (reveal) {
      const visibleIndex = shown.findIndex(
        (item) => mathQuestionId(item) === mathQuestionId(row),
      );
      if (visibleIndex >= 0)
        catalogPagination.setPage(Math.floor(visibleIndex / catalogPagination.pageSize) + 1);
    }
  };
  const currentQuestionId = current ? mathQuestionId(current) : undefined;
  useEffect(() => {
    if (!current) return;
    const currentIndex = shown.findIndex(
      (item) => mathQuestionId(item) === mathQuestionId(current),
    );
    if (currentIndex >= 0)
      catalogPagination.setPage(Math.floor(currentIndex / catalogPagination.pageSize) + 1);
  }, [catalog.data, catalogPagination.pageSize, currentQuestionId]);
  const index = current
    ? rows.findIndex((r) => mathQuestionId(r) === mathQuestionId(current))
    : -1;
  const doSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setSearching(true);
    setSearchError("");
    try {
      setSearchResults(
        mathRows(
          await mathApi.search(
            {
              BookID: book.ID,
              QuestionPage: searchPage,
              QuestionSort: searchNumber,
              QuestionID: "",
            },
            book.BusType === "试卷",
          ),
        ),
      );
    } catch (e) {
      setSearchError(msg(e));
    } finally {
      setSearching(false);
    }
  };
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={16} />
        {backLabel}
      </button>
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">BOOK WORKSPACE</span>
          <h2>{mathTitle(book)}</h2>
          <p>
            {rows.length
              ? `${rows.length} 道题目 · 按原书目录学习`
              : "读取完整题目目录与解析"}
          </p>
        </div>
      </div>
      <div className="math-study-layout">
        <aside className="panel math-catalog">
          {resumeError && <p className="muted" role="status">{resumeError}</p>}
          <div className="math-catalog-heading">
            <h3>题目目录</h3>
            <button
              className="math-icon-button"
              aria-label="刷新题目目录"
              onClick={catalog.reload}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <form onSubmit={doSearch} className="math-page-search">
            <input
              className="input"
              aria-label="页码"
              placeholder="页码"
              value={searchPage}
              onChange={(e) => setSearchPage(e.target.value)}
            />
            <input
              className="input"
              aria-label="题号"
              placeholder="题号"
              value={searchNumber}
              onChange={(e) => setSearchNumber(e.target.value)}
            />
            <button
              className="btn btn-secondary"
              aria-label="按页码和题号搜索"
              disabled={searching || !(searchPage || searchNumber)}
            >
              <Search size={16} />
            </button>
          </form>
          <input
            className="input math-catalog-filter"
            aria-label="筛选章节"
            placeholder="筛选章节、页码、题号"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {searchResults && (
            <button
              className="math-text-button"
              onClick={() => {
                setSearchResults(undefined);
                setSearchPage("");
                setSearchNumber("");
              }}
            >
              显示全部目录（搜索结果 {searchResults.length}）
            </button>
          )}
          <State
            loading={catalog.loading || searching}
            error={catalog.error || searchError}
            empty={!catalog.loading && !shown.length}
            reload={catalog.reload}
          />
          <div className="math-catalog-list" key={catalogPagination.page}>
            {shown.slice(catalogPagination.start, catalogPagination.end).map((r, i) => (
              <button
                key={`${mathQuestionId(r)}-${i}`}
                className={
                  current && mathQuestionId(current) === mathQuestionId(r)
                    ? "active"
                    : ""
                }
                onClick={() => selectQuestion(r)}
              >
                <span>
                  <strong>{r.ChapterName || r.Name || "题目"}</strong>
                  <small>
                    第 {r.QuestionPage || "—"} 页 · 第{" "}
                    {r.QuestionSort || r.QuestionID || catalogPagination.start + i + 1} 题
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          {!catalog.loading && !catalog.error && (
            <Pagination
              label="题目目录"
              page={catalogPagination.page}
              pageSize={catalogPagination.pageSize}
              total={shown.length}
              onPageChange={catalogPagination.setPage}
              onPageSizeChange={catalogPagination.setPageSize}
              pageSizeOptions={[15, 30, 60]}
            />
          )}
        </aside>
        <main className="math-reader-area">
          {current ? (
            <Suspense fallback={<State loading />}><QuestionReader
              row={current}
              book={book}
              stuid={stuid}
              prev={index > 0 ? () => selectQuestion(rows[index - 1], true) : undefined}
              next={
                index >= 0 && index < rows.length - 1
                  ? () => selectQuestion(rows[index + 1], true)
                  : undefined
              }
            /></Suspense>
          ) : (
            <div className="panel math-reader-welcome">
              <div className="math-reader-welcome-icon">
                <BookOpen size={34} />
              </div>
              <h3>选择一道题，专注这一步</h3>
              <p>
                从左侧目录选择题目，或按原书页码与题号搜索。
                <br />
                题干、解析、视频和笔记会在这里展开。
              </p>
              {rows.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={() => selectQuestion(rows[0], true)}
                >
                  从第一题开始
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function PhotoSearch({ stuid, back }: { stuid: string; back: () => void }) {
  const [current, setCurrent] = useState<MathRow>();
  if (current)
    return (
      <div className="math-workspace">
        <button className="math-back" onClick={() => setCurrent(undefined)}>
          <ArrowLeft size={16} />
          返回图片搜索结果
        </button>
        <QuestionReader row={current} stuid={stuid} />
      </div>
    );
  return <MathPhotoSearch stuid={stuid} back={back} onQuestion={setCurrent} />;
}

function PracticeCenter({ stuid }: { stuid: string }) {
  const [params, setParams] = useSearchParams();
  const names: Record<string, string> = { points: "考点刷题", guide: "高分指南", choice: "选择专项", computing: "计算大题" };
  const tab = names[params.get("tab") || ""] || "考点刷题";
  const setTab = (name: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", Object.keys(names).find(key => names[key] === name) || "points"); return next; });
  return (
    <div className="math-workspace">
      <div className="panel math-community-tabs">
        <div className="tabs">
          {Object.values(names).map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === "选择专项" ? (
        <Practice stuid={stuid} />
      ) : tab === "高分指南" ? (
        <MathHighScoreGuide stuid={stuid} />
      ) : tab === "考点刷题" ? (
        <MathRelatedQuestions
          stuid={stuid}
          renderQuestion={(props) => (
            <QuestionReader
              {...props}
              stuid={stuid}
              practice
              noteSource="考点刷题"
            />
          )}
        />
      ) : (
        <MathComputing stuid={stuid} />
      )}
    </div>
  );
}
function Practice({ stuid }: { stuid: string }) {
  const { subject } = useMathLearningPlan();
  const [mode, setMode] = useState("真题模式");
  const [type, setType] = useState("精选10题");
  const [subjectCode, setSubjectCode] = useState("1");
  useEffect(() => { if (subject === "数二" && subjectCode === "3") setSubjectCode("1"); }, [subject, subjectCode]);
  const [paper, setPaper] = useState<number>();
  const [paperReview, setPaperReview] = useState(false);
  const [resetCatalog, setResetCatalog] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [historyShown, setHistoryShown] = useState(false);
  const [importedReport, setImportedReport] = useState<Record<string, any>>();
  const catalogs = useRemote(
    `practice-${stuid}-${subject}-${mode}-${subjectCode}`,
    () =>
      mathApi.practiceCatalog(
        stuid,
        subject,
        mode,
        `0${["数一", "数二", "数三"].indexOf(subject) + 1}0${subjectCode}`,
      ),
  );
  const history = useRemote(
    `practice-history-${stuid}-${subject}-${mode}-${type}`,
    () => mathApi.practiceHistory(stuid, subject, mode, type),
  );
  const rows = mathRows(catalogs.data);
  const start = async (catalogId = 0) => {
    setCreating(true);
    setError("");
    try {
      const res = await mathApi.createPractice(
        stuid,
        subject,
        catalogId,
        mode,
        type,
      );
      const data = mathData(res);
      const id = Number(data?.ID || mathRows(res)[0]?.ID);
      if (!id)
        throw new Error(res?.msg || "平台没有返回可作答的练习，请尝试其他章节");
      setPaperReview(false);
      setPaper(id);
    } catch (e) {
      setError(msg(e));
    } finally {
      setCreating(false);
    }
  };
  if (paper)
    return (
      <PracticePaper
        paper={paper}
        stuid={stuid}
        initialReview={paperReview}
        back={() => {
          setPaper(undefined);
          history.reload();
        }}
      />
    );
  return (
    <div className="math-workspace">
      <div className="panel math-practice-config">
        <div className="math-toolbar">
          <h3>选择你的练习</h3>
          <button
            className="math-text-button"
            onClick={() => setHistoryShown(!historyShown)}
          >
            {historyShown ? "返回章节" : "练习历史"}
          </button>
        </div>
        <div className="math-practice-filters">
          <p className="math-muted">已沿用备考目标：{subject}</p>
          <label>
            题目来源
            <select
              className="input"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {["真题模式", "非真题模式"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            练习方式
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {["精选10题", "章节模式"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            学科
            <select
              className="input"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
            >
              <option value="1">高等数学</option>
              <option value="2">线性代数</option>
              {subject !== "数二" && <option value="3">概率统计</option>}
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="math-error-text">
            {error}
          </p>
        )}
        <button
          className="btn btn-primary"
          disabled={creating}
          onClick={() => start()}
        >
          {creating ? "正在组卷…" : "开始一组练习"}
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="panel">
        {importedReport && <><ImportedReportSummary record={importedReport} /><button className="btn btn-secondary" onClick={() => setImportedReport(undefined)}>收起历史摘要</button></>}
        <div className="math-toolbar">
          <h3>{historyShown ? "我的练习历史" : "按章节练习"}</h3>
          <button
            className="math-icon-button"
            aria-label="刷新练习"
            onClick={historyShown ? history.reload : catalogs.reload}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <State
          loading={historyShown ? history.loading : catalogs.loading}
          error={historyShown ? history.error : catalogs.error}
          empty={
            !(historyShown ? mathRows(history.data) : rows).length &&
            !(historyShown ? history.loading : catalogs.loading)
          }
          reload={historyShown ? history.reload : catalogs.reload}
        />
        {!historyShown && rows.length > 0 && (
          <div className="math-toolbar">
            <select
              className="input mrq-status"
              aria-label="重练章节"
              value={resetCatalog}
              onChange={(e) => setResetCatalog(e.target.value)}
            >
              <option value="">选择要重新练习的章节</option>
              {rows.map((r, i) => (
                <option key={r.ID || i} value={r.ID}>
                  {mathTitle(r)}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary"
              disabled={creating || !resetCatalog}
              onClick={async () => {
                const selected = rows.find(
                  (r) => String(r.ID) === resetCatalog,
                );
                if (
                  !selected ||
                  !window.confirm(
                    `重新练习“${mathTitle(selected)}”？该章节的原刷题记录将清除。`,
                  )
                )
                  return;
                setCreating(true);
                setError("");
                try {
                  await mathPost(
                    "/api/choice_question_exercise_log/DelChoiceQuestionByStuID",
                    {
                      ExanType: mode,
                      Type: type,
                      BusType: subject,
                      CatalogID: selected.ID,
                      System_Station_ID: 1,
                      StuID: stuid,
                    },
                  );
                  await start(Number(selected.ID));
                  catalogs.reload();
                  history.reload();
                } catch (e) {
                  setError(msg(e));
                } finally {
                  setCreating(false);
                }
              }}
            >
              重置并重新练习
            </button>
          </div>
        )}
        <div className="math-content-list">
          {(historyShown ? mathRows(history.data) : rows).map((r, i) => (
            <button
              key={`${r.ID}-${i}`}
              onClick={() => {
                if (historyShown) {
                  if(r._imported){setImportedReport(r);return;}
                  setPaperReview(Number(r.IsFinish) === 1);
                  setPaper(Number(r.ID || r.ExerciseID));
                } else void start(Number(r.ID));
              }}
              disabled={creating}
            >
              <div className="math-list-icon">
                <BookOpen size={20} />
              </div>
              <span>
                <strong>{mathTitle(r)}</strong>
                <small>
                  {historyShown
                    ? `${r._imported ? "小程序导入 · 历史摘要" : r.IsFinish ? "已完成" : "继续作答"}${r.AddTime ? " · " + String(r.AddTime).slice(0, 10) : ""}`
                    : `${r.counts || 0} / ${r.sumcount || r.Count || "—"} 道已练习`}
                </small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PracticePaper({
  paper,
  stuid,
  back,
  initialReview = false,
}: {
  paper: number;
  stuid: string;
  back: () => void;
  initialReview?: boolean;
}) {
  const remote = useRemote(`paper-${paper}`, () =>
    mathApi.practiceQuestions(paper, stuid),
  );
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Record<number, { answer: string; correct: boolean }>
  >({});
  const [finished, setFinished] = useState(initialReview);
  const [reviewOnly, setReviewOnly] = useState(initialReview);
  const [readerVersion, setReaderVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rows = mathRows(remote.data);
  const row = rows[index];
  const done = rows.filter(
    (r) => r.MyAnswer || Object.hasOwn(answers, r.ID),
  ).length;
  const correct = rows.filter((r) =>
    Object.hasOwn(answers, r.ID)
      ? answers[r.ID].correct
      : Number(r.State) === 1,
  ).length;
  const finish = async () => {
    setSaving(true);
    setError("");
    try {
      await mathApi.finishPractice(paper);
      setFinished(true);
      setReviewOnly(true);
      recordStudy({
        platform: "math",
        type: "paper",
        title: `完成数学练习 #${paper} · ${correct}/${rows.length} 题正确`,
        path: "/study/practice",
      });
    } catch (e) {
      setError(msg(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={16} />
        返回练习中心
      </button>
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">FOCUS SESSION · #{paper}</span>
          <h2>{finished ? "这一组练习，完成了" : "专注眼前这一题"}</h2>
          <p>
            已作答 {done} / {rows.length} 题
          </p>
        </div>
        {!finished && !reviewOnly && (
          <button
            className="btn btn-primary"
            disabled={!rows.length || done < rows.length || saving}
            onClick={finish}
          >
            {saving ? "正在提交…" : "提交本次练习"}
          </button>
        )}
      </div>
      {error && (
        <p className="math-error-text" role="alert">
          {error}
        </p>
      )}
      <State
        loading={remote.loading}
        error={remote.error}
        empty={!remote.loading && !rows.length}
        reload={remote.reload}
      />
      {finished && !remote.loading && rows.length > 0 ? (
        <div className="panel math-result">
          <Check size={40} />
          <h3>
            本次练习正确率{" "}
            {rows.length ? Math.round((correct / rows.length) * 100) : 0}%
          </h3>
          <p>
            {correct} 道正确 · {rows.length - correct} 道待巩固 ·
            成绩已保存到当前 Web 学习账号
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => setFinished(false)}
          >
            逐题复盘
          </button>
          <button
            className="btn btn-secondary"
            disabled={saving}
            onClick={async () => {
              if (
                !window.confirm(
                  "重新练习本试卷？将重置当前账号的本次练习状态。",
                )
              )
                return;
              setSaving(true);
              setError("");
              try {
                await mathPost(
                  "/api/choice_question_exercise/UpdateChoiceInfo",
                  { id: paper, IsFinish: 0, UpdateColumns: "ID,IsFinish" },
                );
                setAnswers({});
                setIndex(0);
                setReviewOnly(false);
                setFinished(false);
                setReaderVersion((v) => v + 1);
                remote.reload();
              } catch (e) {
                setError(msg(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            重练这份试卷
          </button>
          <button className="btn btn-primary" onClick={back}>
            继续练习
          </button>
        </div>
      ) : (
        row && (
          <>
            <div className="math-answer-sheet">
              {rows.map((r, i) => {
                const local = answers[r.ID],
                  progress = answerProgress({ saved: !!r.MyAnswer || Object.hasOwn(answers, r.ID), correct: local ? local.correct : Number(r.State) === 1 ? true : Number(r.State) === 2 ? false : undefined });
                return (
                <button
                  className={`${i === index ? "active" : ""} answer-progress-${progress.state}`}
                  key={r.ID || i}
                  onClick={() => setIndex(i)}
                  aria-label={`第 ${i + 1} 题，${progress.label}`}
                  aria-current={i === index ? "step" : undefined}
                  title={progress.label}
                >
                  {i + 1}
                </button>
              ); })}
            </div>
            <QuestionReader
              key={readerVersion}
              row={{
                ...row,
                MyAnswer: answers[row.ID]?.answer ?? row.MyAnswer,
              }}
              stuid={stuid}
              practice
              noteSource="选择题库"
              readOnly={reviewOnly}
              prev={index > 0 ? () => setIndex((i) => i - 1) : undefined}
              next={
                index < rows.length - 1
                  ? () => setIndex((i) => i + 1)
                  : undefined
              }
              onAnswered={async (answer, correct) => {
                await mathApi.saveAnswer(row.ID, answer, correct ? 1 : 2);
                setAnswers((v) => ({ ...v, [row.ID]: { answer, correct } }));
              }}
            />
          </>
        )
      )}
    </div>
  );
}

function ResourceCenter({ stuid }: { stuid: string }) {
  const [params, setParams] = useSearchParams();
  const names: Record<string, string> = { albums: "数学专辑", guide: "高分指南", schools: "院校分析", knowledge: "考研知识" };
  const tab = names[params.get("tab") || ""] || "数学专辑";
  const setTab = (name: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", Object.keys(names).find(key => names[key] === name) || "albums"); return next; });
  return (
    <div className="math-workspace">
      <div className="panel math-community-tabs">
        <div className="tabs">
          {Object.values(names).map(
            (t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ),
          )}
        </div>
      </div>
      {tab === "数学专辑" ? (
        <Albums stuid={stuid} />
      ) : tab === "院校分析" ? (
        <MathSchoolAnalysis />
      ) : tab === "高分指南" ? (
        <MathHighScoreGuide stuid={stuid} />
      ) : (
        <MathInformationResources
          stuid={stuid}
        />
      )}
    </div>
  );
}
function Albums({ stuid }: { stuid: string }) {
  const [selected, setSelected] = useState<MathRow>();
  if (selected)
    return (
      <div className="math-workspace">
        <button className="math-back" onClick={() => setSelected(undefined)}>
          <ArrowLeft size={16} />
          返回数学专辑
        </button>
        <QuestionReader row={selected} stuid={stuid} />
      </div>
    );
  return <MathAlbums stuid={stuid} onQuestion={setSelected} />;
}

function Community({ stuid, userId }: { stuid: string; userId: string }) {
  const [tab, setTab] = useState("学习答疑");
  const [question, setQuestion] = useState<MathRow>();
  if (question)
    return (
      <div className="math-workspace">
        <button className="math-back" onClick={() => setQuestion(undefined)}>
          <ArrowLeft size={16} />
          返回学习答疑
        </button>
        <QuestionReader row={question} stuid={stuid} />
      </div>
    );
  return (
    <div className="math-workspace">
      <div className="panel math-community-tabs">
        <div className="tabs">
          {["学习答疑", "收到的讨论回复", "平台消息"].map((t) => (
            <button
              key={t}
              className={t === tab ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === "学习答疑" ? (
        <MathQuestions stuid={stuid} userId={userId} onQuestion={setQuestion} />
      ) : tab === "收到的讨论回复" ? (
        <MathDiscussionInbox stuid={stuid} />
      ) : (
        <MathMessages stuid={stuid} onQuestion={setQuestion} />
      )}
    </div>
  );
}
function SchoolCenter({ stuid }: { stuid: string }) {
  const [tab, setTab] = useState("院校专业");
  return (
    <div className="math-workspace">
      <div className="panel math-community-tabs">
        <div className="tabs">
          {["院校专业", "初试成绩与排名"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === "院校专业" ? (
        <MathSchools stuid={stuid} />
      ) : (
        <MathScoreRank stuid={stuid} />
      )}
    </div>
  );
}
