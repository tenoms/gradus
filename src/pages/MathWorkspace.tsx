import QuestionReader from "../components/math/MathQuestionReader";
import { useEffect, useState } from "react";
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
import RichContent from "../components/RichContent";
import MathAccountTools from "../components/math/MathAccountTools";
import MathNoteEditor from "../components/math/MathNoteEditor";
import MathNotebook from "../components/math/MathNotebook";
import MathDiscussion, {
  MathDiscussionInbox,
} from "../components/math/MathDiscussion";
import { MathFeedbackButton } from "../components/math/MathQuestionTools";
import MathQuestions, {
  NewMathQuestion,
} from "../components/math/MathQuestions";
import MathSchools from "../components/math/MathSchools";
import MathMessages from "../components/math/MathMessages";
import MathSchoolAnalysis from "../components/math/MathSchoolAnalysis";
import MathPlatformFeedback from "../components/math/MathPlatformFeedback";
import MathQrcodeLookup from "../components/math/MathQrcodeLookup";
import MathInformationResources from "../components/math/MathInformationResources";
import MathCourses from "../components/math/MathCourses";
import MathExams from "../components/math/MathExams";
import MathAlbums from "../components/math/MathAlbums";
import MathRelatedQuestions from "../components/math/MathRelatedQuestions";
import MathPhotoSearch from "../components/math/MathPhotoSearch";
import MathComputing from "../components/math/MathComputing";
import MathBookshelf from "../components/math/MathBookshelf";
import MathScoreRank from "../components/math/MathScoreRank";
import { useSession } from "../lib/session";
import { recordStudy } from "../lib/store";
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
} from "../platforms/math";
import type { MathRow, NoteKind } from "../platforms/math";
import "./MathWorkspace.css";

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
  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
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
        <p>正在读取数学平台内容…</p>
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
  const user = platform.user || {};
  const stuid = String(user.StuID || "");
  const [accountQuestion, setAccountQuestion] = useState<MathRow>();
  useEffect(() => setAccountQuestion(undefined), [section]);
  if (!platform.connected)
    return (
      <div className="panel math-connect">
        <div className="math-connect-icon">∑</div>
        <h2>连接你的数学学习空间</h2>
        <p>使用 yyb 账号登录后，同步教辅、真题、专辑及个人学习记录。</p>
        {platform.error && <p className="math-error-text">{platform.error}</p>}
        <button className="btn btn-primary" onClick={openLogin}>
          使用 yyb 登录
        </button>
      </div>
    );
  let content;
  if (accountQuestion)
    content = (
      <div className="math-workspace">
        <button
          className="math-back"
          onClick={() => setAccountQuestion(undefined)}
        >
          <ArrowLeft size={16} />
          返回学习空间
        </button>
        <QuestionReader row={accountQuestion} stuid={stuid} />
      </div>
    );
  else if (section === "practice") content = <PracticeCenter stuid={stuid} />;
  else if (section === "review" || section === "notes")
    content = (
      <MathNotebook
        stuid={stuid}
        initialKind={section === "review" ? "错题" : "笔记"}
        renderQuestion={(row) => <QuestionReader row={row} stuid={stuid} />}
      />
    );
  else if (section === "community")
    content = <Community stuid={stuid} userId={Number(user.ID)} />;
  else if (section === "courses") content = <MathCourses stuid={stuid} />;
  else if (section === "exams") content = <MathExams stuid={stuid} />;
  else if (section === "schools") content = <SchoolCenter stuid={stuid} />;
  else if (section === "resources") content = <ResourceCenter stuid={stuid} />;
  else content = <Library stuid={stuid} />;
  return (
    <div className="math-workspace">
      <MathAccountTools user={user} onQuestion={setAccountQuestion} />
      {content}
    </div>
  );
}

function Library({ stuid }: { stuid: string }) {
  const [searchParams] = useSearchParams();
  const remote = useRemote("math-books", mathApi.books);
  const [kind, setKind] = useState("全部");
  const [subject, setSubject] = useState("全部");
  const [year, setYear] = useState("全部");
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [book, setBook] = useState<MathRow>();
  const [photoShown, setPhotoShown] = useState(false);
  const [shelfShown, setShelfShown] = useState(false);
  const [qrShown, setQrShown] = useState(false);
  const [qrQuestion, setQrQuestion] = useState<MathRow>();
  const [limit, setLimit] = useState(36);
  const rows = mathRows(remote.data);
  useEffect(() => {
    setSearch(searchParams.get("q") || "");
    setBook(undefined);
    setLimit(36);
  }, [searchParams]);
  const years = [
    ...new Set(rows.map((r) => String(r.BookYear || "")).filter(Boolean)),
  ]
    .sort()
    .reverse();
  const filtered = rows.filter(
    (r) =>
      (kind === "全部" ||
        (kind === "真题" ? r.BusType === "试卷" : r.BusType !== "试卷")) &&
      (subject === "全部" || r.BusValue === subject || r.BusValue === "通用") &&
      (year === "全部" || String(r.BookYear) === year) &&
      (!search ||
        [r.Name, r.Author, r.BookAuthor, r.BusValue, r.BookYear]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
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
      />
    );
  if (photoShown)
    return <PhotoSearch stuid={stuid} back={() => setPhotoShown(false)} />;
  if (shelfShown)
    return (
      <div className="math-workspace">
        <button className="math-back" onClick={() => setShelfShown(false)}>
          <ArrowLeft size={16} />
          返回全部教辅
        </button>
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
      <div className="math-intro">
        <div>
          <span className="eyebrow">MATH LIBRARY</span>
          <h2>从一本好书，开始今天的进步</h2>
          <p>教辅、历年真题与逐题解析，连接你原有的数学学习内容。</p>
        </div>
        <div className="math-intro-symbol">
          ∫ <small>∞</small>
        </div>
      </div>
      <div className="panel math-library">
        <div className="math-toolbar">
          <div className="tabs">
            {["全部", "教辅", "真题"].map((t) => (
              <button
                key={t}
                className={kind === t ? "active" : ""}
                onClick={() => {
                  setKind(t);
                  setLimit(36);
                }}
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
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(36);
              }}
            />
          </label>
        </div>
        <div className="math-filters">
          <span>学习范围</span>
          <select
            aria-label="数学类别"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setLimit(36);
            }}
          >
            {["全部", "数一", "数二", "数三"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="资料年份"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setLimit(36);
            }}
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
        <State
          loading={remote.loading}
          error={remote.error}
          empty={!remote.loading && !remote.error && !filtered.length}
          reload={remote.reload}
        />
        <div className="math-book-grid">
          {filtered.slice(0, limit).map((r, i) => (
            <button
              key={`${r.ID}-${i}`}
              className="math-book-card"
              onClick={() => setBook(r)}
            >
              <div className={`math-cover math-cover-${i % 4}`}>
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
                  {r.BusType === "试卷" ? "历年真题" : r.BusValue || "数学教辅"}
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
        {filtered.length > limit && (
          <button
            className="btn btn-secondary math-load-more"
            onClick={() => setLimit((v) => v + 36)}
          >
            加载更多资料
          </button>
        )}
      </div>
    </div>
  );
}

function BookWorkspace({
  book,
  stuid,
  back,
}: {
  book: MathRow;
  stuid: string;
  back: () => void;
}) {
  const catalog = useRemote(`book-${book.ID}`, () =>
    mathApi.bookCatalog(book.ID),
  );
  const [current, setCurrent] = useState<MathRow>(book._resumeQuestion);
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
        返回资料库
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
          <div className="math-catalog-list">
            {shown.map((r, i) => (
              <button
                key={`${mathQuestionId(r)}-${i}`}
                className={
                  current && mathQuestionId(current) === mathQuestionId(r)
                    ? "active"
                    : ""
                }
                onClick={() => setCurrent(r)}
              >
                <span>
                  <strong>{r.ChapterName || r.Name || "题目"}</strong>
                  <small>
                    第 {r.QuestionPage || "—"} 页 · 第{" "}
                    {r.QuestionSort || r.QuestionID || i + 1} 题
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </aside>
        <main className="math-reader-area">
          {current ? (
            <QuestionReader
              key={mathQuestionId(current)}
              row={current}
              book={book}
              stuid={stuid}
              prev={index > 0 ? () => setCurrent(rows[index - 1]) : undefined}
              next={
                index >= 0 && index < rows.length - 1
                  ? () => setCurrent(rows[index + 1])
                  : undefined
              }
            />
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
                  onClick={() => setCurrent(rows[0])}
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
  const [tab, setTab] = useState("选择题练习");
  return (
    <div className="math-workspace">
      <div className="panel math-community-tabs">
        <div className="tabs">
          {["选择题练习", "分类题库", "计算大题"].map((t) => (
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
      {tab === "选择题练习" ? (
        <Practice stuid={stuid} />
      ) : tab === "分类题库" ? (
        <MathRelatedQuestions
          stuid={stuid}
          renderQuestion={(props) => (
            <QuestionReader
              {...props}
              stuid={stuid}
              practice
              noteSource="选择题库"
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
  const [subject, setSubject] = useState("数一");
  const [mode, setMode] = useState("真题模式");
  const [type, setType] = useState("精选10题");
  const [subjectCode, setSubjectCode] = useState("1");
  const [paper, setPaper] = useState<number>();
  const [paperReview, setPaperReview] = useState(false);
  const [resetCatalog, setResetCatalog] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [historyShown, setHistoryShown] = useState(false);
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
      <div className="math-intro">
        <div>
          <span className="eyebrow">DAILY PRACTICE</span>
          <h2>用一组题，检验真正的理解</h2>
          <p>沿用数学平台的组卷、答题和成绩记录，保持你的学习连续性。</p>
        </div>
        <div className="math-intro-symbol">
          f <small>(x)</small>
        </div>
      </div>
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
          <label>
            考试类别
            <select
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {["数一", "数二", "数三"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
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
              <option value="3">概率统计</option>
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
                    ? `${r.IsFinish ? "已完成" : "继续作答"}${r.AddTime ? " · " + String(r.AddTime).slice(0, 10) : ""}`
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
            成绩已同步至数学平台
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
                  "重新练习本试卷？将按原平台规则重置此卷完成状态。",
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
              {rows.map((r, i) => (
                <button
                  className={`${i === index ? "active" : ""} ${r.MyAnswer || Object.hasOwn(answers, r.ID) ? "answered" : ""}`}
                  key={r.ID || i}
                  onClick={() => setIndex(i)}
                  aria-label={`第 ${i + 1} 题`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <QuestionReader
              key={`${mathQuestionId(row)}-${readerVersion}`}
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
  const [tab, setTab] = useState("数学专辑");
  return (
    <div className="math-workspace">
      <div className="panel math-community-tabs">
        <div className="tabs">
          {["数学专辑", "院校分析", "考研知识", "平台更新", "意见反馈"].map(
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
      ) : tab === "意见反馈" ? (
        <MathPlatformFeedback stuid={stuid} />
      ) : (
        <MathInformationResources
          stuid={stuid}
          kind={tab === "考研知识" ? "knowledge" : "updates"}
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

function Community({ stuid, userId }: { stuid: string; userId: number }) {
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
