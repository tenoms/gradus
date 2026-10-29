import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { invalidateCatalogResources } from "../../shared/api/client";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  ImagePlus,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { computerPracticeType } from "./practice/computer-learning";
import type { ComputerExerciseLaunch as ExerciseLaunch } from "./practice/computer-learning";
import ComputerSubjects, {
  ComputerSubjectPicker,
  useComputerSubjects,
} from "./practice/ComputerSubjects";
import { useSession } from "../../shared/auth/session";
import { recordActivity } from "../learning/state/store";
import {
  computerRequest as request,
  buildComputerAnswer,
  buildComputerSubmission,
  computerExamConfig,
  computerClozeGroups,
  restoreComputerAnswers,
  computerSubjects,
  computerUpload,
  descendants,
  exerciseSource,
  examSources,
  extractExercises,
  identity,
  label,
  objectiveAnswer,
  plain,
  records,
  safeLink,
  typeNames,
} from "./api/computer";
import type { ComputerRecord as R } from "./api/computer";
import "./computer.css";

const RichContent = lazy(() => import("../../shared/content/RichContent"));
const ComputerCourses = lazy(() => import("./courses/ComputerCourses"));
const ComputerSchools = lazy(() => import("./schools/ComputerSchools"));
const ExerciseSession = lazy(() => import("./practice/ComputerExerciseSession"));
const ComputerReview = lazy(() => import("./review/ComputerReview"));
const ComputerSpecialPractice = lazy(() => import("./practice/ComputerSpecialPractice"));
const ComputerStages = lazy(() => import("./review/ComputerReports"));
const ComputerChapterGroups = lazy(() => import("./practice/ComputerChapterGroups"));
const ComputerCommunity = lazy(() => import("./community/ComputerCommunity"));

function useLoad(path: string, query: R = {}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [version, setVersion] = useState(0);
  const serialized = JSON.stringify(query);
  useEffect(() => {
    if (!path) {
      setData(null);
      setError("");
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
  return { data, error, loading, reload: () => { invalidateCatalogResources(); setVersion((v) => v + 1); } };
}
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
  if (loading)
    return (
      <div className="computer-status" role="status">
        <LoaderCircle className="spin" size={22} />
        正在读取计算机学习内容…
      </div>
    );
  if (error)
    return (
      <div className="computer-status computer-error" role="alert">
        <span>{error}</span>
        {retry && (
          <button className="btn btn-secondary" onClick={retry}>
            <RefreshCw size={15} />
            重试
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="empty-state">
        <BookOpen size={30} />
        <h3>这里还没有内容</h3>
        <p>当前账号或筛选条件下暂无可用记录。</p>
      </div>
    );
  return null;
}
function Pager({
  page,
  setPage,
  data,
}: {
  page: number;
  setPage: (p: number) => void;
  data: any;
}) {
  const pages = Number(
    data?.pages ||
      data?.totalPages ||
      Math.ceil(Number(data?.total || 0) / 20) ||
      1,
  );
  return (
    <div className="computer-pager">
      <button
        className="btn btn-secondary"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        上一页
      </button>
      <span>
        第 {page} 页{pages > 1 ? ` / ${pages}` : ""}
      </span>
      <button
        className="btn btn-secondary"
        disabled={page >= pages && !data?.hasNextPage}
        onClick={() => setPage(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}
function SubjectSelect({
  value,
  onChange,
  subjects = computerSubjects,
}: {
  value: string;
  onChange: (id: string) => void;
  subjects?: R[];
}) {
  return (
    <select
      className="input computer-select"
      aria-label="选择计算机科目"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
const fieldLabels: R = {
  exerciseDay: "累计学习天数",
  answerTotal: "累计答题数",
  failRate: "错误率",
  ranking: "学习排名",
  examinationExerciseTotalNum: "累计试卷题数",
  schoolName: "院校",
  csName: "专业",
  majorName: "专业",
  year: "年份",
  degreeType: "学位类型",
  firstSubject: "初试科目",
  firstScore: "初试分数",
  firstScoreMin: "最低分",
  firstScoreMax: "最高分",
  enrollNumber: "招生人数",
  planNumber: "计划人数",
  provinceName: "省份",
  remark: "说明",
  name: "名称",
  examName: "试卷名称",
  score: "得分",
  correctNumber: "正确题数",
  answerTotalNumber: "作答数",
  exerciseTotalNumber: "题目数",
  createDate: "创建时间",
  totalScore: "总分",
  exerciseNumber: "答题数",
  totalNumber: "累计题数",
  incorrectNumber: "错题数",
  collectNumber: "收藏数",
  accuracy: "正确率",
  practiceTime: "学习时长",
  answerTime: "答题时长",
  startTime: "开始时间",
  endTime: "结束时间",
  useTime: "用时",
  rank: "排名",
  correctRate: "正确率",
  schoolType: "院校类型",
  feature: "院校特色",
  address: "院校地址",
  website: "院校官网",
};
function DetailFields({ item }: { item: R }) {
  return (
    <dl className="computer-fields">
      {Object.entries(item)
        .filter(
          ([key, value]) =>
            fieldLabels[key] &&
            value != null &&
            value !== "" &&
            typeof value !== "object" &&
            !/url|image|id$|token|phone|password|code|buy|price/i.test(key),
        )
        .map(([key, value]) => (
          <div key={key}>
            <dt>
              {(
                {
                  schoolName: "院校",
                  csName: "专业",
                  majorName: "专业",
                  year: "年份",
                  degreeType: "学位类型",
                  firstSubject: "初试科目",
                  firstScore: "初试分数",
                  firstScoreMin: "最低分",
                  firstScoreMax: "最高分",
                  enrollNumber: "招生人数",
                  planNumber: "计划人数",
                  provinceName: "省份",
                  remark: "说明",
                  name: "名称",
                  examName: "试卷名称",
                  score: "得分",
                  correctNumber: "正确题数",
                  answerTotalNumber: "作答数",
                  exerciseTotalNumber: "题目数",
                  createDate: "创建时间",
                  totalScore: "总分",
                } as R
              )[key] || fieldLabels[key]}
            </dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
    </dl>
  );
}

function QuestionBank({ launch }: { launch: (s: ExerciseLaunch) => void }) {
  const [searchParams] = useSearchParams();
  const { subjects, reload: reloadSubjects } = useComputerSubjects(),
    [subject, setSubject] = useState<R>(computerSubjects[0]),
    [mode, setMode] = useState("practice"),
    [groupChapter, setGroupChapter] = useState<R | null>(null),
    [filter, setFilter] = useState(searchParams.get("q") || ""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [searchId, setSearchId] = useState(searchParams.get("exerciseId") || "");
  useEffect(() => setFilter(searchParams.get("q") || ""), [searchParams]);
  const incomingExercise = searchParams.get("exerciseId");
  useEffect(() => {
    if (incomingExercise) {
      setSearchId(incomingExercise);
      void search(undefined, incomingExercise);
    }
  }, [incomingExercise]);
  const major = String(subject.id),
    category = Number(subject.examCategory || 1);
  const chapters = useLoad(
    ["practice", "exam"].includes(mode)
      ? "/api/exam/wx/practice/knowledge"
      : "",
    {
      majorId: major,
      examType: computerPracticeType(category, mode === "exam"),
    },
  );
  const rows = descendants(records(chapters.data));
  useEffect(() => {
    if (
      subjects.length &&
      !subjects.some(
        (s) =>
          String(s.id) === major && Number(s.examCategory || 1) === category,
      )
    )
      setSubject(subjects[0]);
  }, [subjects]);
  async function begin(chapter: R, random = false) {
    if (mode === "practice" && !random) {
      setGroupChapter(chapter);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = {
        majorId: major,
        chapterId: identity(chapter),
        examType: computerPracticeType(category, mode === "exam"),
        examCategory: category,
        number: mode === "practice" ? 1 : "",
      };
      const data = await request(
        random
          ? "/api/exam/wx/practice/random/exercise"
          : "/api/exam/wx/practice/exerciseList",
        query,
      );
      launch({
        data,
        title: random ? "随机练习" : label(chapter),
        majorId: major,
        chapterId: identity(chapter),
        examType: query.examType,
        examCategory: category,
        random,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function search(file?: File, exerciseId = searchId) {
    setLoading(true);
    setError("");
    try {
      const data = file
        ? await computerUpload(file, "/api/exam/wx/searchExercise/photo")
        : await request(
            `/api/exam/wx/searchExercise/info/${encodeURIComponent(exerciseId.trim())}`,
          );
      const found = extractExercises(data);
      launch({
        data: {
          ...data,
          exercises: found.length ? found : Array.isArray(data) ? data : [data],
        },
        title: file ? "图片搜题结果" : "题目检索",
        source: file ? "photo" : "scan",
        majorId: major,
        examType: 3,
        readOnly: true,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  const modeTabs = (
    <div className="tabs computer-source-tabs">
      {[
        ["practice", "逐题练习"],
        ["exam", "章节测评"],
        ["special", "简答与复试"],
        ["subjects", "管理自选科目"],
      ].map(([id, title]) => (
        <button
          key={id}
          className={mode === id ? "active" : ""}
          onClick={() => setMode(id)}
        >
          {title}
        </button>
      ))}
    </div>
  );
  if (groupChapter)
    return (
      <ComputerChapterGroups
        chapter={groupChapter}
        subject={subject}
        onClose={() => setGroupChapter(null)}
        launch={launch}
      />
    );
  if (mode === "special")
    return (
      <>
        {modeTabs}
        <ComputerSpecialPractice launch={launch} />
      </>
    );
  if (mode === "subjects")
    return (
      <>
        {modeTabs}
        <div className="panel">
          <ComputerSubjects onUpdated={reloadSubjects} />
        </div>
      </>
    );
  return (
    <>
      {modeTabs}
      <div className="panel computer-toolbar">
        <ComputerSubjectPicker
          value={subject}
          subjects={subjects}
          onChange={setSubject}
        />
        <button
          className="btn btn-primary"
          disabled={loading}
          onClick={() => void begin({ id: "1" }, true)}
        >
          开始随机练习
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="panel computer-searchbar">
        <Search size={17} />
        <input
          className="input"
          aria-label="搜索章节"
          placeholder="搜索章节或知识点"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <input
          className="input"
          aria-label="输入题目编号"
          placeholder="输入题目编号"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
        />
        <button
          className="btn btn-secondary"
          disabled={!searchId.trim() || loading}
          onClick={() => void search()}
        >
          找题
        </button>
        <label className="btn btn-secondary computer-upload">
          <ImagePlus size={16} />
          图片搜题
          <input
            type="file"
            accept="image/*"
            disabled={loading}
            onChange={(e) => void search(e.target.files?.[0])}
          />
        </label>
      </div>
      <Status loading={loading} error={error} />
      <div className="panel">
        <div className="computer-section-label">
          <h3>章节与知识点</h3>
          <span>{rows.length} 个章节 / 知识点</span>
        </div>
        <Status
          loading={chapters.loading}
          error={chapters.error}
          empty={!chapters.loading && !chapters.error && !rows.length}
          retry={chapters.reload}
        />
        <div className="computer-chapters">
          {rows
            .filter((c) => label(c).includes(filter))
            .map((c, index) => (
              <button
                className="computer-chapter"
                key={`${identity(c)}-${index}`}
                disabled={loading}
                onClick={() => void begin(c)}
              >
                <span className="computer-chapter-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{label(c)}</strong>
                  <span>
                    {c.exerciseNumber ??
                      c.exerciseTotalNumber ??
                      c.totalNumber ??
                      c.total ??
                      "—"}{" "}
                    题
                    {c.answerNumber != null
                      ? ` · 已答 ${c.answerNumber} 题`
                      : ""}
                  </span>
                </div>
                <span className="computer-pill">
                  {mode === "practice" ? "练习" : "测评"}
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
        </div>
      </div>
    </>
  );
}

function Exams({ launch }: { launch: (s: ExerciseLaunch) => void }) {
  const [source, setSource] = useState("school"),
    [major, setMajor] = useState(computerSubjects[0].id),
    [school, setSchool] = useState(""),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const schools = useLoad(
    source === "school" ? "/api/exam/wx/practice/school" : "",
    { parentId: "701741873861103616" },
  );
  useEffect(() => {
    if (!school && records(schools.data).length)
      setSchool(identity(records(schools.data)[0]));
  }, [schools.data, school]);
  const config = examSources.find((s) => s.id === source) || examSources[0],
    list = useLoad(
      ["special", "stages"].includes(source) || (source === "school" && !school)
        ? ""
        : config.path,
      {
        schoolId: source === "school" ? school : undefined,
        majorId: source === "school" ? undefined : major,
        examCategory: 1,
        pageNum: page,
        pageSize: 20,
        examType: source === "short" ? 20 : undefined,
      },
    );
  async function begin(item: R) {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/exam/wx/practice/examExercise", {
        examId: item.examId || item.id,
      });
      launch({
        data,
        title: label(item),
        majorId: item.majorId || major,
        ...computerExamConfig(source),
        source,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  const sources = [
      ...examSources,
      { id: "special", name: "简答与复试" },
      { id: "stages", name: "阶段测评与报告" },
    ],
    navigation = (
      <div className="computer-source-tabs tabs">
        {sources.map((s) => (
          <button
            key={s.id}
            className={s.id === source ? "active" : ""}
            onClick={() => {
              setSource(s.id);
              setPage(1);
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
    );
  if (source === "special")
    return (
      <>
        {navigation}
        <ComputerSpecialPractice launch={launch} />
      </>
    );
  if (source === "stages")
    return (
      <>
        {navigation}
        <ComputerStages launch={launch} />
      </>
    );
  return (
    <>
      <div className="computer-source-tabs tabs">
        {sources.map((s) => (
          <button
            key={s.id}
            className={s.id === source ? "active" : ""}
            onClick={() => {
              setSource(s.id);
              setPage(1);
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="panel computer-toolbar">
        {source === "school" ? (
          <select
            className="input computer-select"
            aria-label="选择院校"
            value={school}
            onChange={(e) => {
              setSchool(e.target.value);
              setPage(1);
            }}
          >
            {records(schools.data).map((s) => (
              <option value={identity(s)} key={identity(s)}>
                {label(s)}
              </option>
            ))}
          </select>
        ) : (
          <SubjectSelect
            value={major}
            onChange={(v) => {
              setMajor(v);
              setPage(1);
            }}
          />
        )}
        <input
          className="input"
          aria-label="筛选试卷"
          placeholder="在当前列表中筛选试卷"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Status
        loading={loading || schools.loading}
        error={error || schools.error}
      />
      <div className="panel">
        <Status
          loading={list.loading}
          error={list.error}
          empty={!list.loading && !list.error && !records(list.data).length}
          retry={list.reload}
        />
        {records(list.data)
          .filter((item) => label(item).includes(search))
          .map((item, i) => (
            <div className="computer-list-row" key={`${identity(item)}-${i}`}>
              <span className="computer-file-icon">
                <FileText size={22} />
              </span>
              <div className="computer-grow">
                <h3>{label(item)}</h3>
                <p>
                  {[
                    item.year,
                    item.exerciseTotalNumber
                      ? `${item.exerciseTotalNumber} 题`
                      : null,
                    item.totalScore ? `${item.totalScore} 分` : null,
                    item.duration ? `${item.duration} 分钟` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "在线作答 · 自动同步学习记录"}
                </p>
              </div>
              <button
                className="btn btn-primary"
                disabled={loading}
                onClick={() => void begin(item)}
              >
                开始答题
                <ArrowRight size={15} />
              </button>
            </div>
          ))}
        <Pager page={page} setPage={setPage} data={list.data} />
      </div>
    </>
  );
}

function Resources() {
  const [type, setType] = useState(""),
    [article, setArticle] = useState<R | null>(null),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const list = useLoad("/api/exam/wx/article/articleList", {
    articleType: type,
  });
  const articleRows = records(list.data).filter((item) =>
    label(item).includes(search),
  );
  return (
    <>
      <div className="panel computer-toolbar">
        <div className="tabs">
          {[
            ["", "全部资讯"],
            ["1", "考研资讯"],
            ["2", "备考资料"],
            ["3", "学习方法"],
          ].map(([id, title]) => (
            <button
              key={id}
              className={type === id ? "active" : ""}
              onClick={() => {
                setType(id);
                setArticle(null);
                setPage(1);
              }}
            >
              {title}
            </button>
          ))}
        </div>
        <input
          className="input"
          aria-label="搜索资讯"
          placeholder="在资讯中搜索"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {article ? (
        <div className="panel">
          <button className="computer-back" onClick={() => setArticle(null)}>
            <ArrowLeft size={16} />
            全部资讯
          </button>
          <h2>{label(article)}</h2>
          <RichContent
            content={
              article.content ||
              article.articleContent ||
              article.articleBrief ||
              article.description
            }
          />
          {safeLink(article.articleUrl || article.url) && (
            <a
              className="btn btn-primary"
              href={safeLink(article.articleUrl || article.url)}
              target="_blank"
              rel="noreferrer"
            >
              阅读原文
              <ArrowRight size={15} />
            </a>
          )}
        </div>
      ) : (
        <div className="panel">
          <Status
            loading={list.loading}
            error={list.error}
            empty={!list.loading && !list.error && !records(list.data).length}
            retry={list.reload}
          />
          {articleRows.slice((page - 1) * 20, page * 20).map((item, i) => (
            <button
              className="computer-article-row"
              key={i}
              onClick={() => setArticle(item)}
            >
              <span className="computer-file-icon">
                <FileText size={23} />
              </span>
              <div>
                <h3>{label(item)}</h3>
                <p>
                  {plain(
                    item.articleBrief || item.description || item.summary,
                  ) || "学习资讯与备考资料"}
                  {item.createDate ? ` · ${item.createDate}` : ""}
                </p>
              </div>
              <ChevronRight size={18} />
            </button>
          ))}
          <Pager
            page={page}
            setPage={setPage}
            data={{ total: articleRows.length }}
          />
        </div>
      )}
    </>
  );
}

export function ComputerLearningSettings({ onClose }: { onClose?: () => void }) {
  return (
    <div className="computer-workspace">
      {onClose && <button className="computer-back" onClick={onClose}>
        <ArrowLeft size={16} />
        返回学习
      </button>}
      <div className="panel">
        <ComputerSubjects />
      </div>
    </div>
  );
}

export default function ComputerWorkspace({ section }: { section: string }) {
  const { session, openLogin } = useSession(),
    [launch, setLaunch] = useState<ExerciseLaunch | null>(null);
  const learnerIdentity = session.user?.id || "guest";
  useEffect(() => setLaunch(null), [section, learnerIdentity]);
  if (!session.authenticated) return <div className="panel computer-auth-gate"><h2>登录学习空间</h2><p>使用你的账号查看计算机内容与学习记录。</p><button className="btn btn-primary" onClick={openLogin}>登录学习空间<ArrowRight size={16} /></button></div>;
  if (launch)
    return (
      <Suspense fallback={<Status loading />}><ExerciseSession
        key={`${launch.data.examId}-${launch.title}`}
        launch={launch}
        onClose={() => setLaunch(null)}
      /></Suspense>
    );
  return (
    <div className="computer-workspace">
      <Suspense fallback={<Status loading />}>
      {section === "courses" ? (
        <ComputerCourses />
      ) : section === "exams" ? (
        <Exams launch={setLaunch} />
      ) : section === "review" ? (
        <ComputerReview key={section} launch={setLaunch} />
      ) : section === "notes" ? (
        <ComputerReview key={section} initial="notes" launch={setLaunch} />
      ) : section === "community" ? (
        <ComputerCommunity />
      ) : section === "schools" ? (
        <ComputerSchools />
      ) : section === "resources" ? (
        <Resources />
      ) : (
        <QuestionBank key={section} launch={setLaunch} />
      )}
      </Suspense>
    </div>
  );
}
