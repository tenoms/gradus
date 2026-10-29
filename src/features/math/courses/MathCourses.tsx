import { useMathLearningPlan } from "../preparation/MathLearningPlan";
import { matchesMathSubject } from "../preparation/learning-plan-model.mjs";
import MathVideoFeedback from "./MathVideoFeedback";
import Pagination from "../../../shared/ui/pagination/Pagination";
import { usePagination } from "../../../shared/ui/pagination/use-pagination";
import { useStudyTimer } from "../../learning/time/use-study-timer";
import { useEffect, useRef, useState } from "react";
import { invalidateCatalogResources } from "../../../shared/api/client";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Play,
  RefreshCw,
  Search,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { useSession } from "../../../shared/auth/session";
import { mathApi, mathData, mathRows } from "../api/math";
import type { MathRow as Row } from "../api/math";
import { recordActivity } from "../../learning/state/store";
import {
  courseApi,
  courseLabel,
  courseLinks,
  courseImages,
} from "./math-courses";
import {
  calendarFinished,
  durationSeconds,
  taskType,
  videoProgressRecord,
  leakPaperState,
  courseMinutes,
  packetTreeRows,
  completedCourseAssignments,
  courseResumeTarget,
  packetResumeEntry,
  packetVisitRecord,
  courseQuestionRecord,
} from "./course-model.mjs";
import { MathCoursePaper } from "../exams/MathExams";
import LearningVideo from "../../../shared/media/LearningVideo";
import { loadMathVideo } from "../media/math-video";
import type { MathVideo } from "../media/math-video";
import { mathVideoSource } from "../media/math-video-source.mjs";
import MathQuestionVideo from "../questions/MathQuestionVideo";
import MathModelTraining from "../practice/MathModelTraining";
import MathCourseHistory from "./MathCourseHistory";
import MathSchoolCoursePractice from "../schools/MathSchoolCoursePractice";
import MathCourseRecommendations from "./MathCourseRecommendations";
import MathCourseAlbum from "./MathCourseAlbum";
import MathQuestionReader from "../questions/MathQuestionReader";
import "./math-courses.css";

type Context = {
  StuID: string;
  CourseID: number | string;
  CalendarID: number | string;
  ProductID: number | string;
};
function useContent(key: string, loader: () => Promise<any>) {
  const [data, setData] = useState<any>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    loader()
      .then((v) => {
        if (active) setData(v);
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
  return { data, loading, error, reload: () => { invalidateCatalogResources(); setVersion((v) => v + 1); } };
}
function Status({
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
      <div className="mc-status" role="status">
        <LoaderCircle className="spin" size={20} />
        正在读取数学课程…
      </div>
    );
  if (error)
    return (
      <div className="mc-status mc-error" role="alert">
        {error}
        {reload && (
          <button className="btn btn-secondary" onClick={reload}>
            重试
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="empty-state">
        <BookOpen size={30} />
        <h3>当前账号暂无相关内容</h3>
        <p>课程与学习记录同步到当前学习账号。</p>
      </div>
    );
  return null;
}
function Back({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  return (
    <button className="mc-back" onClick={onClick}>
      <ArrowLeft size={16} />
      {children}
    </button>
  );
}
function Files({ item }: { item: Row }) {
  return (
    <div className="mc-files">
      {courseLinks(item).map((f) => (
        <a
          className="btn btn-secondary"
          href={f.url}
          target="_blank"
          rel="noreferrer"
          key={f.url}
        >
          <FileText size={16} />
          {f.name}
        </a>
      ))}
    </div>
  );
}

function VodPlayer(props: {
  task: Row;
  context: Context;
  onSaved: () => void;
}) {
  const [version, setVersion] = useState(0);
  return <NativeVodPlayer key={version} {...props} onRetry={() => setVersion(v => v + 1)} />;
}

function NativeVodPlayer({
  task,
  context,
  onSaved,
  onRetry,
}: {
  task: Row;
  context: Context;
  onSaved: () => void;
  onRetry: () => void;
}) {
  const data = task.Data || task._w_courseware || task;
  const { vid } = mathVideoSource(data);
  const videoRef = useRef<HTMLVideoElement>(null),
    recordedActivity = useRef(false),
    record = useRef<Row>({}),
    latest = useRef(0),
    lastSaved = useRef(0),
    saving = useRef(false),
    duration = useRef(durationSeconds(data.Duration)),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [video, setVideo] = useState<MathVideo>();
  const callback = useRef(onSaved);
  callback.current = onSaved;
  async function save(force = false) {
    const element = videoRef.current;
    const observed = Number(element?.currentTime || 0);
    if (observed > 0) latest.current = Math.max(latest.current, observed);
    if (element && Number.isFinite(element.duration) && element.duration > 0)
      duration.current = element.duration;
    if (
      saving.current ||
      latest.current <= Number(record.current.BusValue || 0) ||
      (!force && latest.current - lastSaved.current < 20)
    )
      return;
    saving.current = true;
    try {
      const payload = videoProgressRecord(
          context,
          task,
          latest.current,
          duration.current,
          record.current,
        ),
        response = await courseApi.saveRecord(payload),
        value = mathData(response);
      record.current = {
        ...payload,
        ID: Number(value) > 0 ? Number(value) : record.current.ID,
      };
      lastSaved.current = Number(payload.BusValue);
      setError("");
      setNotice(
        Number(payload.IsFinished) === 1
          ? "本课时已完成，进度已同步。"
          : "播放进度已保存",
      );
      callback.current();
    } catch (e: any) {
      setError(`播放进度保存失败：${e.message}`);
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      courseApi.records({ ...context, BusType: 2, BusID: task.BusID }),
      loadMathVideo(data),
    ]).then(([result, source]) => {
      if (!active) return;
      record.current = mathRows(result)[0] || {};
      latest.current = Number(record.current.BusValue || 0);
      lastSaved.current = latest.current;
      duration.current = Number(source.duration) || duration.current;
      setVideo(source);
    }).catch((e: any) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
      void save(true);
    };
  }, []);
  return (
    <div className="mc-vod">
      <h3>{courseLabel(data)}</h3>
      {video && <LearningVideo
        ref={videoRef}
        src={video.url}
        poster={video.poster}
        controls
        playsInline
        preload="metadata"
        className="mc-native-video"
        aria-label={`${courseLabel(data)}视频播放器`}
        study={{
          key: `math-course-video:${context.CourseID}:${context.CalendarID}:${task.BusID}`,
          platform: "math",
          title: courseLabel(data),
          path: "/study/courses",
        }}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) duration.current = e.currentTarget.duration;
          e.currentTarget.currentTime = latest.current;
        }}
        onPlaying={() => {
          if (recordedActivity.current) return;
          recordedActivity.current = true;
          recordActivity({
            platform: "math",
            type: "course",
            title: courseLabel(data),
            path: "/study/courses",
          });
        }}
        onTimeUpdate={(e) => {
          latest.current = Math.max(latest.current, e.currentTarget.currentTime);
          void save();
        }}
        onPause={() => {
          void save(true);
        }}
        onEnded={() => {
          void save(true);
        }}
      />}
      {!video && !error && (
        <div className="mc-status" role="status">
          <LoaderCircle className="spin" size={16} />
          正在加载视频…
        </div>
      )}
      {error && (
        <div className="mc-status mc-error" role="alert">
          {error}
          <button className="btn btn-secondary" onClick={video ? () => void save(true) : onRetry}>
            重试
          </button>
        </div>
      )}
      {notice && <p className="mc-notice" role="status">{notice}</p>}
      <button
        className="btn btn-secondary"
        onClick={() => void save(true)}
        disabled={!video || saving.current}
      >
        保存播放进度
      </button>
      <Files item={data} />
      {vid && (
        <MathVideoFeedback
          vid={vid}
          videoId={data.ID || 0}
          stuid={context.StuID}
        />
      )}
    </div>
  );
}

function QuestionTask({
  task,
  context,
  onSaved,
  recordProgress = true,
}: {
  task: Row;
  context: Context;
  onSaved: () => void;
  recordProgress?: boolean;
}) {
  const query = useContent(`course-q-${task.BusID}`, () => mathApi.question(task.BusID)),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [previous, setPrevious] = useState<Row>((task._record || [])[0] || {});
  const q = query.data ? mathRows(query.data)[0] || task.Data || {} : task.Data || {};
  async function save(
    answer: string,
    correct: boolean,
    details?: { question: Row; options: Row[] },
  ) {
    setError("");
    setNotice("");
    const payload = courseQuestionRecord(
      context,
      {
        ...task,
        Data: {
          ...task.Data,
          ID: task.Data?.ID || task.BusID,
          BookID: task.Data?.BookID || details?.question.BookID || q.BookID,
        },
      },
      details?.options.length ? answer : correct ? 1 : 2,
      previous,
    );
    const result = await courseApi.saveRecord(payload),
      id = Number(mathData(result));
    setPrevious({ ...payload, ...(id > 0 ? { ID: id } : {}) });
    setNotice("本题答案已保存到课程学习记录。");
    try {
      const latest = mathRows(
          await courseApi.tasks(
            context.StuID,
            context.CalendarID,
            context.ProductID,
          ),
        ),
        questions = latest.filter((row) => Number(row.BusType) === 1);
      const current = questions.find(
        (row) =>
          String(row.Data?.ID || row.BusID) ===
          String(task.Data?.ID || task.BusID),
      );
      if (current?._record?.length) setPrevious(current._record[0]);
      onSaved();
    } catch (e: any) {
      setError(`本题已保存，日程进度暂未同步：${e.message}`);
    }
  }
  return (
    <div className="panel mc-task-reader">
      <Status
        loading={query.loading}
        error={query.error || error}
        reload={query.reload}
      />
      {!query.loading && (query.data || task.Data) && (
        <MathQuestionReader
          row={{ ...q, QuestionID: task.BusID, MyAnswer: previous.Answer }}
          stuid={context.StuID}
          isCourse={false}
          practice
          selfAssessmentOnly
          onAnswered={recordProgress ? save : undefined}
        />
      )}
      {previous.ID && (
        <p className="mc-notice">
          本题已有课程作答记录，可查看解析或修改自评。
        </p>
      )}
      {notice && <p className="mc-notice">{notice}</p>}
    </div>
  );
}

function AlbumTask({
  task,
  context,
  onPaper,
}: {
  task: Row;
  context: Context;
  onPaper: (paper: Row) => void;
}) {
  return (
    <MathCourseAlbum
      stuid={context.StuID}
      AlbumID={task.BusID}
      CourseID={context.CourseID}
      CalendarID={context.CalendarID}
      ProductID={context.ProductID}
      onPaper={onPaper}
    />
  );
}

function TaskList({
  tasks,
  context,
  onReload,
  initialTaskID,
}: {
  tasks: Row[];
  context: Context;
  onReload: () => void;
  initialTaskID?: string | number;
}) {
  const [selected, setSelected] = useState<Row>(),
    [paper, setPaper] = useState<Row>(),
    [openError, setOpenError] = useState(""),
    resumed = useRef(false);
  function openTask(task: Row) {
    setOpenError("");
    if ([3, 4, 5, 6, 9].includes(Number(task.BusType))) {
      if (!(task.BusID || task.PaperID)) {
        setOpenError("请先完成前置测评，平台生成练习后即可进入。");
        return;
      }
      setPaper(task);
    } else setSelected(task);
  }
  useEffect(() => {
    if (resumed.current || !initialTaskID || !tasks.length) return;
    const task = tasks.find(
      (row) =>
        String(row.BusID) === String(initialTaskID) ||
        String(row.ID) === String(initialTaskID),
    );
    if (task) {
      resumed.current = true;
      openTask(task);
    }
  }, [tasks, initialTaskID]);
  const selectedContext = selected
    ? {
        ...context,
        CourseID: selected.CourseID ?? context.CourseID,
        CalendarID: selected.CalendarID ?? context.CalendarID,
        ProductID: selected.ProductID ?? context.ProductID,
      }
    : context;
  useStudyTimer({
    key: `math-course-reading:${context.StuID}:${selectedContext.CourseID}:${selectedContext.CalendarID}:${selected?.ID || selected?.BusID || ""}`,
    platform: "math",
    title: selected ? courseLabel(selected) : "课程资料",
    path: "/study/courses",
    enabled: !!selected && !paper && ![1, 2, 8].includes(Number(selected.BusType)) && !!(selected.Content || selected.Context || selected.Data?.Context || selected.Notes),
  });
  if (paper && Number(paper._Paper?.BusType) === 2)
    return (
      <MathCourseRecommendations
        stuid={context.StuID}
        PaperID={paper.BusID || paper.PaperID || paper.ID}
        CourseID={paper.CourseID ?? context.CourseID}
        CalendarID={paper.CalendarID ?? context.CalendarID}
        ProductID={paper.ProductID ?? context.ProductID}
        isSuper={!!paper.isSuper}
        onClose={() => {
          setPaper(undefined);
          onReload();
        }}
      />
    );
  if (paper && Number(paper.BusType) === 5)
    return (
      <MathSchoolCoursePractice
        stuid={context.StuID}
        PaperID={paper.BusID || paper.PaperID || paper.ID}
        CourseID={paper.CourseID ?? context.CourseID}
        CalendarID={paper.CalendarID ?? context.CalendarID}
        ProductID={paper.ProductID ?? context.ProductID}
        onCompleted={onReload}
        onClose={() => {
          setPaper(undefined);
          onReload();
        }}
      />
    );
  if (paper)
    return (
      <MathCoursePaper
        stuid={context.StuID}
        PaperID={Number(paper.BusID || paper.PaperID || paper.ID)}
        isTeacher={Number(paper.BusType) === 6}
        isAbility={Number(paper.BusType) === 9}
        CourseID={Number(paper.CourseID ?? context.CourseID)}
        CalendarID={Number(paper.CalendarID ?? context.CalendarID)}
        ProductID={Number(paper.ProductID ?? context.ProductID)}
        onClose={() => {
          setPaper(undefined);
          onReload();
        }}
      />
    );
  const visible = tasks;
  return (
    <>
      {openError && <p className="mc-error">{openError}</p>}
      <div className="mc-task-list">
        {visible.map((task, i) => {
          const finished = (task._record || []).some(
            (r: Row) =>
              Number(r.IsFinished) === 1 && Number(r.BusRelationID || 0) === 0,
          );
          return (
            <button
              key={task.ID || i}
              className={`mc-task ${selected?.ID === task.ID ? "active" : ""}`}
              onClick={() => openTask(task)}
            >
              <span className="mc-task-icon">
                {finished ? (
                  <CheckCircle2 size={19} />
                ) : Number(task.BusType) === 2 ? (
                  <Play size={19} />
                ) : (
                  <FileText size={19} />
                )}
              </span>
              <span>
                <strong>{courseLabel(task.Data || task._Paper || task)}</strong>
                <small>
                  {taskType(task)}
                  {task.Data?.Duration ? ` · ${task.Data.Duration}` : ""}
                  {finished ? " · 已完成" : ""}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          );
        })}
      </div>
      {selected && (
        <>
          <Back onClick={() => setSelected(undefined)}>收起学习内容</Back>
          {Number(selected.BusType) === 2 ? (
            <VodPlayer
              key={selected.ID}
              task={selected}
              context={selectedContext}
              onSaved={onReload}
            />
          ) : Number(selected.BusType) === 1 ? (
            <QuestionTask
              key={selected.ID}
              task={selected}
              context={selectedContext}
              onSaved={onReload}
            />
          ) : Number(selected.BusType) === 8 ? (
            <AlbumTask
              task={selected}
              context={selectedContext}
              onPaper={setPaper}
            />
          ) : (
            <div className="panel mc-task-reader">
              <h3>{courseLabel(selected)}</h3>
              <RichContent
                content={
                  selected.Content ||
                  selected.Context ||
                  selected.Data?.Context ||
                  selected.Notes
                }
              />
              <Files item={selected} />
              {(selected._book_highscorealbum_catalog_content || []).map(
                (r: Row, i: number) => (
                  <button
                    className="mc-task"
                    key={r.ID || i}
                    onClick={() =>
                      setPaper({ ...r, BusID: r.PaperID || r.BusID || r.ID })
                    }
                  >
                    <span>
                      <strong>{courseLabel(r)}</strong>
                      <small>查看作业</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ),
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function CalendarCourse({
  course,
  product,
  stuid,
  onBack,
  initialCalendarID,
  initialTaskID,
}: {
  course: Row;
  product: Row;
  stuid: string;
  onBack: () => void;
  initialCalendarID?: string | number;
  initialTaskID?: string | number;
}) {
  const chapters = useContent(`chapter-${product.ID}-${course.ID}`, () =>
      courseApi.chapters(stuid, course.ID, product.ID),
    ),
    [calendar, setCalendar] = useState<Row>(),
    [error, setError] = useState(""),
    [starting, setStarting] = useState(false);
  const taskQuery = useContent(
    `tasks-${calendar?.ID || 0}-${product.ID}`,
    () =>
      calendar
        ? courseApi.tasks(stuid, calendar.ID, product.ID)
        : Promise.resolve({ data: [] }),
  );
  const sections = mathRows(chapters.data),
    all = sections.flatMap((c) => c.CalendarList || []),
    resumeOpened = useRef(false);
  const last = useContent(
    `course-last-${stuid}-${product.ID}-${course.ID}`,
    () => courseApi.last(stuid, product.ID),
  );
  const resumeTarget = courseResumeTarget(mathData(last.data)),
    resumeDay = all.find(
      (c) =>
        String(c.ID) === String(resumeTarget?.CalendarID) &&
        String(resumeTarget?.CourseID) === String(course.ID),
    );
  async function open(item: Row) {
    setCalendar(item);
    setStarting(true);
    setError("");
    try {
      if (!(item.c_course_users_progressList || []).length)
        await courseApi.progress({
          StuID: stuid,
          CourseID: course.ID,
          BusType: 1,
          BusID: item.ID,
          IsFinished: 0,
          ProductID: product.ID,
        });
      await courseApi.visit({
        StuID: stuid,
        CourseID: course.ID,
        CalendarID: item.ID,
        BusType: 1,
        BusID: product.ID,
        Json: `/course/pages/List/List?courseID=${course.ID}&calendarID=${item.ID}&chapterName=${encodeURIComponent(courseLabel(course))}&calendaName=${encodeURIComponent(courseLabel(item))}&isPay=${Number(product.IsPay) || 0}&productid=${product.ID}`,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }
  useEffect(() => {
    if (resumeOpened.current || !initialCalendarID || !all.length) return;
    const day = all.find(
      (item) => String(item.ID) === String(initialCalendarID),
    );
    if (day) {
      resumeOpened.current = true;
      void open(day);
    }
  }, [chapters.data, initialCalendarID]);
  return (
    <>
      <Back onClick={onBack}>返回课程目录</Back>
      <h2>{courseLabel(course)}</h2>
      {resumeDay && !calendar && (
        <div className="panel mc-resume">
          <span>
            <small>最近学习的日程</small>
            <strong>{courseLabel(resumeDay)}</strong>
          </span>
          <button
            className="btn btn-primary"
            disabled={starting}
            onClick={() => void open(resumeDay)}
          >
            <Play size={15} />
            继续学习
          </button>
        </div>
      )}
      <details className="panel mc-history-panel">
        <summary>查看本课程历次成绩</summary>
        <MathCourseHistory stuid={stuid} CourseID={course.ID} />
      </details>
      <Status
        loading={chapters.loading || starting}
        error={chapters.error || error}
        reload={chapters.reload}
      />
      <div className="mc-calendar-layout">
        <aside className="panel mc-calendar">
          <h3>章节与学习日程</h3>
          <Status
            empty={!chapters.loading && !chapters.error && !sections.length}
          />
          {sections.map((section, i) => (
            <details key={section.ID || i} open>
              <summary>{courseLabel(section)}</summary>
              {(section.CalendarList || []).map((item: Row, j: number) => (
                <button
                  className={`mc-calendar-day ${calendar?.ID === item.ID ? "active" : ""}`}
                  key={item.ID || j}
                  disabled={starting}
                  onClick={() => void open(item)}
                >
                  <span>
                    {calendarFinished(item) ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <BookOpen size={16} />
                    )}
                  </span>
                  <span>
                    {courseLabel(item)}
                    <small>
                      {calendarFinished(item)
                        ? "已完成"
                        : item.c_course_users_recordList?.length
                          ? "学习中"
                          : "开始学习"}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </details>
          ))}
        </aside>
        <main className="panel mc-learning">
          {calendar ? (
            <>
              <div className="mc-heading">
                <h3>{courseLabel(calendar)}</h3>
                <button
                  className="btn btn-secondary"
                  onClick={taskQuery.reload}
                >
                  <RefreshCw size={14} />
                  刷新
                </button>
              </div>
              <Status
                loading={taskQuery.loading}
                error={taskQuery.error}
                empty={
                  !taskQuery.loading &&
                  !taskQuery.error &&
                  !mathRows(taskQuery.data).length
                }
                reload={taskQuery.reload}
              />
              <TaskList
                key={calendar.ID}
                initialTaskID={
                  String(calendar.ID) === String(initialCalendarID)
                    ? initialTaskID
                    : undefined
                }
                tasks={mathRows(taskQuery.data)}
                context={{
                  StuID: stuid,
                  CourseID: course.ID,
                  CalendarID: calendar.ID,
                  ProductID: product.ID,
                }}
                onReload={() => {
                  taskQuery.reload();
                  chapters.reload();
                }}
              />
            </>
          ) : (
            <div className="empty-state">
              <BookOpen size={32} />
              <h3>选择一个学习日程</h3>
              <p>题目、录播、作业与测评会按原课程安排展开。</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function AssignmentSummary({
  tasks,
  context,
  onReload,
}: {
  tasks: Row[];
  context: Context;
  onReload: () => void;
}) {
  const summary = completedCourseAssignments(tasks),
    [paper, setPaper] = useState<Row>();
  if (paper)
    return (
      <MathCoursePaper
        stuid={context.StuID}
        PaperID={Number(paper.BusID || paper.PaperID)}
        CourseID={paper.CourseID ?? context.CourseID}
        CalendarID={paper.CalendarID ?? context.CalendarID}
        ProductID={paper.ProductID ?? context.ProductID}
        isTeacher={Number(paper.BusType) === 6}
        onClose={() => {
          setPaper(undefined);
          onReload();
        }}
      />
    );
  const max = Math.max(1, ...summary.rows.map((row) => Number(row.Score) || 0));
  return (
    <section className="mc-task-reader">
      <div className="mc-heading">
        <h3>已完成作业与成长记录</h3>
        <small>
          已完成 {summary.rows.length} / {summary.total} 份
        </small>
      </div>
      {summary.rows.length ? (
        <>
          <div className="mc-score-history">
            {summary.rows.map((row, index) => (
              <div key={row.ID || index}>
                <span>
                  {row.ModuleName ||
                    row.Title ||
                    row.Name ||
                    `作业 ${index + 1}`}
                </span>
                <div className="mc-score-track">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, (Number(row.Score || 0) / max) * 100))}%`,
                    }}
                  />
                </div>
                <strong>{row.Score ?? "—"}</strong>
              </div>
            ))}
          </div>
          <div className="mc-history-table">
            <table>
              <thead>
                <tr>
                  <th>模块与作业</th>
                  <th>分数</th>
                  <th>排名</th>
                  <th>完成时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row, index) => (
                  <tr key={row.ID || index}>
                    <td>
                      {row.ModuleName || "课程作业"}
                      <small>
                        {row.Title || row.Name || row._c_paper?.Name || ""}
                      </small>
                    </td>
                    <td>{row.Score ?? "—"}</td>
                    <td>{row.ranking ?? row.Ranking ?? "—"}</td>
                    <td>
                      {String(row.CompletedAt || "")
                        .replace("T", " ")
                        .slice(0, 16) || "—"}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setPaper(row)}
                      >
                        回看作业
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mc-status">完成并公布的作业成绩会显示在这里。</p>
      )}
    </section>
  );
}
function Packet({
  packet,
  product,
  stuid,
  onBack,
  autoResume = false,
}: {
  packet: Row;
  product: Row;
  stuid: string;
  onBack: () => void;
  autoResume?: boolean;
}) {
  const [course, setCourse] = useState<Row>(),
    [tab, setTab] = useState("tree"),
    [expanded, setExpanded] = useState<Row[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    autoResumed = useRef(false),
    packetSections = useRef<Row[]>([]);
  const packetInfo = useContent(`packet-info-${packet.ID}`, () =>
      courseApi.packet(packet.ID),
    ),
    tree = useContent(`tree-${product.ID}-${packet.ID}`, () =>
      courseApi.packetTree(packet.ID, product.ID),
    ),
    last = useContent(`packet-last-${stuid}-${product.ID}-${packet.ID}`, () =>
      courseApi.packetLast(stuid, product.ID, packet.ID),
    );
  const assignment = useContent(
    `assign-${product.ID}-${packet.ID}-${tab}`,
    () =>
      ["assign", "study"].includes(tab)
        ? courseApi.assignments(stuid, packet.ID, product.ID)
        : tab === "exams"
          ? courseApi.exams(stuid, packet.ID, product.ID)
          : Promise.resolve({ data: [] }),
  );
  const allNodes = packetTreeRows(mathRows(tree.data)),
    nodes = allNodes.filter(
      (n) =>
        Number(n.ID) !== Number(packet.ID) &&
        n.PID !== "",
    ),
    lastRow = mathRows(last.data)[0];
  async function select(row: Row, resume = false) {
    setError("");
    const bound = allNodes.find((n) => String(n.ID) === String(row.ID)) || row;
    if (row.CourseID) {
      setLoading(true);
      try {
        const details = row._c_course_list?._c_course_calendar_detail || [];
        setCourse({
          ...row._c_course_list,
          ...row,
          ID: row.CourseID,
          BusType: row._c_course_list?.BusType || row.BusType,
          ...(resume
            ? {
                _resumeCalendarID: details[0]?.CalendarID || row.CalendarID,
                _resumeBusID:
                  details.length === 1 ? details[0]?.BusID : undefined,
              }
            : {}),
        });
        if (Number(row.State) !== 2)
          await courseApi.progress(packetVisitRecord(stuid, product.ID, packet.ID, row));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const parentChapter = bound._depth >= 2 ? bound.PID : row.ID,
        response = await courseApi.packetChapter(
          stuid,
          product.ID,
          packet.ID,
          parentChapter,
        ),
        sections = mathRows(response),
        target = sections.find((s) => String(s.ID) === String(row.ID));
      const visible = target ? [target] : sections;
      packetSections.current = sections;
      setExpanded(visible);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function resumeLast() {
    if (!lastRow) return;
    setLoading(true);
    setError("");
    try {
      const chapter = allNodes.find(
        (node) => String(node.ID) === String(lastRow.ChapterID2),
      );
      const response = await courseApi.packetChapter(
        stuid,
        product.ID,
        packet.ID,
        lastRow.ChapterID1 || chapter?.PID || lastRow.ChapterID2,
      );
      packetSections.current = mathRows(response);
      const found = packetResumeEntry(packetSections.current, lastRow);
      if (!found)
        throw new Error("原学习位置暂未出现在当前目录，可手动选择章节。");
      await select(found.entry, true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (
      autoResume &&
      !autoResumed.current &&
      !last.loading &&
      !tree.loading &&
      lastRow
    ) {
      autoResumed.current = true;
      void resumeLast();
    }
  }, [autoResume, last.data, tree.data]);
  if (course)
    return course.BusType === "真题查漏补缺" ? (
      <LeakCourse
        stuid={stuid}
        product={product}
        course={course}
        onBack={() => setCourse(undefined)}
      />
    ) : (
      <CalendarCourse
        stuid={stuid}
        product={product}
        course={course}
        initialCalendarID={course._resumeCalendarID}
        initialTaskID={course._resumeBusID}
        onBack={() => {
          setCourse(undefined);
          last.reload();
        }}
      />
    );
  return (
    <>
      <Back onClick={onBack}>返回课程包</Back>
      <h2>{courseLabel(packet)}</h2>
      <details className="panel mc-history-panel">
        <summary>课程安排与讲义</summary>
        <Status
          loading={packetInfo.loading}
          error={packetInfo.error}
          reload={packetInfo.reload}
        />
        <RichContent
          content={
            mathRows(packetInfo.data)[0]?.Context ||
            mathRows(packetInfo.data)[0]?.Content
          }
        />
        <div className="mc-schedule-images">
          {courseImages(mathRows(packetInfo.data)[0]?.HeadImg).map((url, i) => (
            <img src={url} alt={`课程安排 ${i + 1}`} key={url} loading="lazy" />
          ))}
        </div>
        <Files item={mathRows(packetInfo.data)[0] || packet} />
      </details>
      {lastRow && (
        <div className="panel mc-resume">
          <span>
            <small>上次学到</small>
            <strong>
              {lastRow.Title || lastRow.CourseName || "继续最近的课程"}
            </strong>
          </span>
          <button
            className="btn btn-primary"
            disabled={loading}
            onClick={() => void resumeLast()}
          >
            <Play size={15} />
            继续学习
          </button>
        </div>
      )}
      <div className="tabs mc-tabs">
        {[
          ["tree", "课程目录"],
          ["assign", "我的作业"],
          ["exams", "我的考试"],
          ["study", "学习数据"],
        ].map(([id, title]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {title}
          </button>
        ))}
      </div>
      <Status loading={loading} error={error} />
      {tab === "tree" ? (
        <div className="panel">
          <Status
            loading={tree.loading}
            error={tree.error}
            empty={!tree.loading && !tree.error && !nodes.length}
            reload={() => {
              tree.reload();
            }}
          />
          <div className="mc-tree">
            {nodes.map((row, i) => (
              <button
                className="mc-task"
                key={row.ID || i}
                style={{
                  paddingLeft: `${Math.max(0, Number(row._depth) - 1) * 18}px`,
                }}
                onClick={() => void select(row)}
              >
                <BookOpen size={19} />
                <span>
                  <strong>{courseLabel(row)}</strong>
                  <small>
                    {row.CourseID ? "进入学习日程" : "展开章节"}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          {expanded.map((chapter, i) => (
            <section key={chapter.ID || i}>
              <h3>{courseLabel(chapter)}</h3>
              {(chapter._c_course_packet || []).map((row: Row, j: number) => (
                <button
                  className="mc-task"
                  key={row.ID || j}
                  onClick={() => void select(row)}
                >
                  <BookOpen size={18} />
                  <span>
                    <strong>{courseLabel(row)}</strong>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Status
            loading={assignment.loading}
            error={assignment.error}
            empty={
              !assignment.loading &&
              !assignment.error &&
              !mathRows(assignment.data).length
            }
            reload={assignment.reload}
          />
          {tab === "study" ? (
            <AssignmentSummary
              tasks={mathRows(assignment.data)}
              context={{
                StuID: stuid,
                CourseID: packet.ID,
                CalendarID: 0,
                ProductID: product.ID,
              }}
              onReload={assignment.reload}
            />
          ) : (
            <TaskList
              tasks={mathRows(assignment.data)}
              context={{
                StuID: stuid,
                CourseID: packet.ID,
                CalendarID: 0,
                ProductID: product.ID,
              }}
              onReload={assignment.reload}
            />
          )}
        </div>
      )}
    </>
  );
}

function LeakReport({
  task,
  context,
  onBack,
  onAnswers,
}: {
  task: Row;
  context: Context;
  onBack: () => void;
  onAnswers: () => void;
}) {
  const params = { ...context, PaperID: task.BusID };
  const report = useContent(
    `leak-report-${context.ProductID}-${task.BusID}`,
    async () => {
      const values = await Promise.allSettled([
        courseApi.leakStats(params, 1),
        courseApi.leakStats(params, 2),
        courseApi.leakRecommendations(params),
        courseApi.leakModules(params),
      ]);
      return {
        values: values.map((r) => (r.status === "fulfilled" ? r.value : null)),
        errors: values
          .filter((r) => r.status === "rejected")
          .map(
            (r) =>
              (r as PromiseRejectedResult).reason?.message ||
              "部分分析暂时不可用",
          ),
      };
    },
  );
  const [selected, setSelected] = useState<Row>(),
    [model, setModel] = useState<Row>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const recommendations = mathRows(report.data?.values?.[2]),
    modules = mathRows(report.data?.values?.[3]),
    history = mathRows(report.data?.values?.[1]);
  const overview = mathData(report.data?.values?.[0]),
    aggregate = Array.isArray(overview)
      ? {
          count: overview[0]?.[0]?.examnum,
          max: overview[1]?.[0]?.maxScore,
          min: overview[2]?.[0]?.minScore,
          distribution: overview[3]?.[0],
        }
      : {};
  const existing = new Set(
    recommendations
      .filter((r) => Number(r.IsValid) === 1)
      .map((r) => String(r.ContentID)),
  );
  async function add(row: Row) {
    setBusy(true);
    setError("");
    try {
      const data = row.LeadFillID
        ? {
            ID: row.LeadFillID,
            IsValid: 1,
            BusType: "学生新增",
            UpdateColumns: "IsValid,BusType",
          }
        : {
            ...context,
            PaperID: task.BusID,
            AddPerson: context.StuID,
            Type: "模块",
            ContentID: row.BusID,
            Title: row.Title,
            IsFinsh: 0,
            OutlineType:
              row.OutlineType === "低"
                ? 1
                : row.OutlineType === "中"
                  ? 2
                  : row.OutlineType === "高"
                    ? 3
                    : row.OutlineType,
            DifficultyType: row.DifficultyType || "",
            QuestionID: row.QuestionID,
            Sort: 0,
            IsValid: 1,
            Notes: row.BusNotes || "",
            BusType: "学生新增",
          };
      await courseApi.addLeakModules([data], !!row.LeadFillID);
      setNotice("已加入模块训练，学习计划已同步。");
      report.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (model)
    return (
      <MathModelTraining
        stuid={context.StuID}
        albumId={model.ContentID}
        isLeadFill
        context={{
          ProductID: context.ProductID,
          CourseID: context.CourseID,
          CalendarID: context.CalendarID,
          PaperID: task.BusID,
          LeadFillID: model.ID,
        }}
        onClose={() => {
          setModel(undefined);
          report.reload();
        }}
        onCompleted={report.reload}
      />
    );
  return (
    <>
      <Back onClick={onBack}>返回查漏补缺日程</Back>
      <div className="panel mc-product">
        <h2>{courseLabel(task._Paper || task)} · 查漏分析</h2>
        <p className="mc-notice">
          {Number(task._c_paper_student?.Score) >= 0
            ? `本次得分 ${task._c_paper_student.Score} 分。`
            : ""}
          训练完成状态随当前学习账号保存。
        </p>
        <button className="btn btn-secondary" onClick={onAnswers}>
          查看作答与老师批阅
        </button>
        <Files item={task._Paper || task} />
      </div>
      <Status
        loading={report.loading}
        error={report.error || error}
        reload={report.reload}
      />
      {notice && <p className="mc-notice">{notice}</p>}
      {report.data?.errors?.map((e: string, i: number) => (
        <p className="mc-error" key={i}>
          {e}
        </p>
      ))}
      {aggregate.count != null && (
        <div className="panel mc-task-reader">
          <h3>测评概况</h3>
          <div className="mc-stat-grid">
            <div>
              <small>参与测评</small>
              <strong>{aggregate.count} 人</strong>
            </div>
            <div>
              <small>最高分</small>
              <strong>{aggregate.max ?? "—"}</strong>
            </div>
            <div>
              <small>最低分</small>
              <strong>{aggregate.min ?? "—"}</strong>
            </div>
          </div>
          {aggregate.distribution && (
            <div className="mc-distribution">
              {[39, 69, 89, 109, 129, 150].map((score, index) => {
                const count = Number(
                    aggregate.distribution[`data${index + 1}`] || 0,
                  ),
                  max = Math.max(
                    1,
                    ...[1, 2, 3, 4, 5, 6].map((i) =>
                      Number(aggregate.distribution[`data${i}`] || 0),
                    ),
                  );
                return (
                  <div key={score}>
                    <span>{count} 人</span>
                    <i
                      style={{
                        height: `${Math.max(2, (count / max) * 100)}px`,
                      }}
                    />
                    <small>{score} 分</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {history.length > 0 && (
        <div className="panel mc-task-reader">
          <h3>历次测评分数</h3>
          <div className="mc-score-history">
            {history.map((row, i) => (
              <div key={row.ID || i}>
                <span>{row.Name || row.AddTime || `第 ${i + 1} 次`}</span>
                <div className="mc-score-track">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, (Number(row.Score || 0) / 150) * 100))}%`,
                    }}
                  />
                </div>
                <strong>{row.Score ?? "—"}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="panel mc-task-reader">
        <div className="mc-heading">
          <h3>推荐考点与模块</h3>
          <button className="btn btn-secondary" onClick={report.reload}>
            <RefreshCw size={14} />
            刷新学习状态
          </button>
        </div>
        <Status empty={!report.loading && !recommendations.length} />
        {recommendations.map((row, i) => (
          <button
            className="mc-task"
            key={row.ID || i}
            onClick={() =>
              row.Type === "模块" ? setModel(row) : setSelected(row)
            }
          >
            <span className="mc-badge">{row.Type}</span>
            <span>
              <RichContent content={row.Title || row.Name} />
              <small>
                {Number(row.IsFinsh) === 1 ? "已完成" : "待巩固"}
                {row.OutlineType ? ` · 难度 ${row.OutlineType}` : ""}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
        {selected?.QuestionID && (
          <>
            <Back onClick={() => setSelected(undefined)}>收起推荐内容</Back>
            <QuestionTask
              task={{ ID: selected.ID, BusID: selected.QuestionID }}
              context={context}
              onSaved={() => {}}
              recordProgress={false}
            />
          </>
        )}
      </div>
      {modules.length > 0 && (
        <div className="panel mc-task-reader">
          <h3>选择需要加强的模块</h3>
          {modules.map((row, i) => (
            <div className="mc-task" key={row.ID || i}>
              <span>
                <RichContent content={row.Title || row.Name} />
                <small>
                  {row.Score != null
                    ? `得分 ${row.Score} / ${row.QuestionScore || "—"}`
                    : row.BusNotes || ""}
                </small>
              </span>
              <button
                className="btn btn-secondary"
                disabled={busy || existing.has(String(row.BusID))}
                onClick={() => void add(row)}
              >
                {existing.has(String(row.BusID)) ? "已在训练中" : "加入训练"}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function LeakCourse({
  course,
  product,
  stuid,
  onBack,
}: {
  course: Row;
  product: Row;
  stuid: string;
  onBack: () => void;
}) {
  const remote = useContent(
    `leak-course-${product.ID}-${course.ID}`,
    async () => {
      const chapters = mathRows(
          await courseApi.chapters(stuid, course.ID, product.ID),
        ),
        calendar = chapters[0]?.CalendarList?.[0];
      if (!calendar) return { calendar: null, tasks: [], counts: [] };
      const context = {
        StuID: stuid,
        CourseID: course.ID,
        CalendarID: calendar.ID,
        ProductID: product.ID,
      };
      const [tasks, counts] = await Promise.all([
        courseApi.tasks(stuid, calendar.ID, product.ID),
        courseApi.leakCalendar(context),
      ]);
      return { calendar, tasks: mathRows(tasks), counts: mathRows(counts) };
    },
  );
  const [selected, setSelected] = useState<Row>(),
    [view, setView] = useState(""),
    [error, setError] = useState("");
  const tasks: Row[] = (remote.data?.tasks || []).map((row: Row) => ({
    ...row,
    leakState: leakPaperState(
      row,
      remote.data.counts.find(
        (c: Row) =>
          Number(c.PaperID) === Number(row.BusID) && Number(c.IsFinsh) === 0,
      )?.counts || 0,
    ),
  }));
  const context: Context = {
    StuID: stuid,
    CourseID: course.ID,
    CalendarID: remote.data?.calendar?.ID || 0,
    ProductID: product.ID,
  };
  function open(row: Row, index: number) {
    setError("");
    setSelected(row);
    setView(row.leakState >= 3 ? "report" : "exam");
  }
  if (selected && view === "report")
    return (
      <LeakReport
        task={selected}
        context={context}
        onBack={() => {
          setSelected(undefined);
          remote.reload();
        }}
        onAnswers={() => setView("exam")}
      />
    );
  if (selected && view === "exam")
    return (
      <MathCoursePaper
        stuid={stuid}
        PaperID={selected.BusID}
        CourseID={course.ID}
        CalendarID={context.CalendarID}
        ProductID={product.ID}
        isTeacher
        onClose={() => {
          setSelected(undefined);
          remote.reload();
        }}
      />
    );
  return (
    <>
      <Back onClick={onBack}>返回课程目录</Back>
      <div className="panel mc-product">
        <span className="eyebrow">REVIEW & IMPROVE</span>
        <h2>{courseLabel(course)}</h2>
        <p>完成测评、查看批阅，再按考点与模块巩固薄弱环节。</p>
      </div>
      <Status
        loading={remote.loading}
        error={remote.error || error}
        reload={remote.reload}
      />
      <div className="panel mc-task-reader">
        <Status empty={!remote.loading && !remote.error && !tasks.length} />
        {tasks.map((row, index) => (
          <div className="mc-task" key={row.ID || index}>
            <FileText size={22} />
            <span>
              <strong>{courseLabel(row._Paper || row)}</strong>
              <small>
                {
                  [
                    "尚未开始",
                    "继续作答",
                    "老师阅卷中",
                    "继续巩固训练",
                    "已完成",
                  ][row.leakState]
                }
              </small>
            </span>
            <Files item={row._Paper || row} />
            <button
              className="btn btn-primary"
              onClick={() => open(row, index)}
            >
              {row.leakState >= 3 ? "查看分析" : "进入测评"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function Product({
  product: initial,
  stuid,
  onBack,
  resume,
}: {
  product: Row;
  stuid: string;
  onBack: () => void;
  resume?: Row;
}) {
  const remote = useContent(`product-${initial.ID}`, () =>
      courseApi.product(stuid, initial.ID),
    ),
    [packet, setPacket] = useState<Row>(),
    [course, setCourse] = useState<Row>(),
    [resumeError, setResumeError] = useState(""),
    resuming = useRef(false);
  const raw = mathData(remote.data),
    product = {
      ...initial,
      ...(Array.isArray(raw) ? raw[0] || {} : raw || {}),
    },
    packets: Row[] = product._c_course_packet || [],
    courses: Row[] = product.CourseList || product._c_course_list || [];
  useEffect(() => {
    if (!resume || resuming.current || remote.loading || !remote.data) return;
    resuming.current = true;
    if (resume.CoursePacketID) {
      const found = packets.find(
        (p) => String(p.ID) === String(resume.CoursePacketID),
      );
      if (found) {
        setPacket(found);
        return;
      }
    }
    if (resume.CourseID) {
      const found = courses.find(
        (c) => String(c.ID) === String(resume.CourseID),
      );
      const enter = (info: Row) =>
        setCourse({
          ...info,
          _resumeCalendarID: resume.CalendarID,
          _resumeBusID: resume.BusID,
        });
      if (found) enter(found);
      else
        courseApi
          .courseInfo(resume.CourseID)
          .then((r) => {
            const info = mathRows(r)[0];
            if (info) enter(info);
            else setResumeError("原课时不在当前课程目录中，可手动选择课程。");
          })
          .catch((e) => setResumeError(e.message));
    }
  }, [remote.data, resume]);
  if (packet)
    return (
      <Packet
        autoResume={!!resume}
        packet={packet}
        product={product}
        stuid={stuid}
        onBack={() => setPacket(undefined)}
      />
    );
  if (course)
    return course.BusType === "真题查漏补缺" ? (
      <LeakCourse
        course={course}
        product={product}
        stuid={stuid}
        onBack={() => setCourse(undefined)}
      />
    ) : (
      <CalendarCourse
        course={course}
        product={product}
        stuid={stuid}
        initialCalendarID={course._resumeCalendarID}
        initialTaskID={course._resumeBusID}
        onBack={() => setCourse(undefined)}
      />
    );
  return (
    <>
      <Back onClick={onBack}>返回数学课程</Back>
      <div className="panel mc-product">
        <span className="eyebrow">MATH COURSE</span>
        <h2>{courseLabel(product)}</h2>
        <RichContent
          content={product.Intro || product.Remark || product.Description}
        />
        {product.Json && (
          <MathQuestionVideo
            row={{
              PolyvVID: product.Json,
              Title: "观看课程介绍",
              playsafe:
                product.playsafe || product.PlaySafe || product.PlayToken,
              sign: product.sign,
              ts: product.ts,
            }}
          />
        )}
        <div className="mc-schedule-images">
          {courseImages(product.Android_Img || product.IOS_Img).map(
            (url, i) => (
              <img
                src={url}
                alt={`课程介绍 ${i + 1}`}
                key={url}
                loading="lazy"
              />
            ),
          )}
        </div>
        <Files item={product} />
      </div>
      <Status
        loading={remote.loading}
        error={remote.error || resumeError}
        reload={remote.reload}
      />
      <div className="mc-grid">
        {packets.map((p, i) => (
          <button
            className="panel mc-card"
            key={p.ID || i}
            onClick={() => setPacket(p)}
          >
            <div className="mc-card-body">
              <span className="mc-card-icon"><BookOpen size={25} /></span>
              <h3>{courseLabel(p)}</h3>
              <p>课程包 · 日历任务 · 作业测评</p>
              <span className="mc-link">
                打开课程包
                <ChevronRight size={16} />
              </span>
            </div>
          </button>
        ))}
        {courses.map((c, i) => (
          <button
            className="panel mc-card"
            key={c.ID || i}
            onClick={() => setCourse(c)}
          >
            <div className="mc-card-body">
              <span className="mc-card-icon"><BookOpen size={25} /></span>
              <h3>{courseLabel(c)}</h3>
              <p>章节与学习日程</p>
              <span className="mc-link">
                进入课程
                <ChevronRight size={16} />
              </span>
            </div>
          </button>
        ))}
      </div>
      <Status
        empty={
          !remote.loading && !remote.error && !packets.length && !courses.length
        }
      />
    </>
  );
}

export default function MathCourses({ stuid }: { stuid: string }) {
  const catalogRef = useRef<HTMLDivElement>(null);
  const { subject } = useMathLearningPlan();
  const [allSubjects, setAllSubjects] = useState(false);
  const [tab, setTab] = useState("owned"),
    [product, setProduct] = useState<Row>(),
    [paper, setPaper] = useState<Row>(),
    [resume, setResume] = useState<Row>(),
    [search, setSearch] = useState("");
  const remote = useContent(`course-list-${stuid}-${tab}`, () =>
    tab === "owned"
      ? courseApi.products(stuid)
      : tab === "free"
        ? courseApi.free(stuid)
        : tab === "ability"
          ? courseApi.ability(stuid)
          : tab === "catalog"
            ? courseApi.catalog(stuid)
            : tab === "vip"
              ? courseApi.vipCatalog()
              : courseApi.handouts(stuid),
  );
  const last = useContent(`last-study-${stuid}`, () =>
      courseApi.userLast(stuid),
    ),
    lastTarget = courseResumeTarget(mathData(last.data));
  const all = mathRows(remote.data).filter(
    (r) =>
      courseLabel(r).toLowerCase().includes(search.toLowerCase()) &&
      (allSubjects || matchesMathSubject(r, subject)),
  );
  const pagination = usePagination({
    total: all.length,
    pageSize: 30,
    resetKey: JSON.stringify([stuid, tab, subject, allSubjects, search]),
  });
  const rows = all.slice(pagination.start, pagination.end);
  if (product)
    return (
      <div className="math-courses">
        <Product
          product={product}
          resume={resume}
          stuid={stuid}
          onBack={() => {
            setProduct(undefined);
            setResume(undefined);
            last.reload();
            remote.reload();
          }}
        />
      </div>
    );
  if (paper)
    return (
      <MathCoursePaper
        stuid={stuid}
        PaperID={Number(paper.ID)}
        isAbility
        onClose={() => {
          setPaper(undefined);
          remote.reload();
        }}
      />
    );
  return (
    <div className="math-courses">
      {tab === "owned" && lastTarget && (
        <div className="panel mc-resume">
          <span>
            <small>上次学到</small>
            <strong>
              {lastTarget.ProductName ||
                lastTarget.Title ||
                lastTarget.CourseName ||
                "继续最近课程"}
            </strong>
          </span>
          <button
            className="btn btn-primary"
            onClick={() => {
              setResume(lastTarget);
              setProduct({ ID: lastTarget.ProductID });
            }}
          >
            <Play size={15} />
            继续学习
          </button>
        </div>
      )}
      <div className="panel mc-toolbar">
        <div className="tabs">
          {[
            ["owned", "我的课程"],
            ["free", "公开课程"],
            ["vip", "精品课程"],
            ["catalog", "课程目录"],
            ["handouts", "课程资料"],
            ["ability", "能力测评"],
          ].map(([id, title]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setSearch("");
              }}
            >
              {title}
            </button>
          ))}
        </div>
        <button className="btn btn-secondary" onClick={() => setAllSubjects(!allSubjects)}>{allSubjects ? "全部科目 · 回到我的目标" : `${subject} · 浏览全部科目`}</button>
        <label className="mc-search">
          <Search size={17} />
          <input
            className="input"
            aria-label="搜索数学课程"
            value={search}
            placeholder={
              tab === "ability" ? "搜索能力测评试卷" : "搜索课程或资料"
            }
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="btn btn-secondary" onClick={remote.reload}>
          <RefreshCw size={15} />
          刷新
        </button>
      </div>
      <Status
        loading={remote.loading}
        error={remote.error}
        empty={!remote.loading && !remote.error && !all.length}
        reload={remote.reload}
      />
      {all.length > 0 && <p className="mc-count">共 {all.length} 项</p>}
      <div className="mc-grid pagination-content" ref={catalogRef}>
        {rows.map((row, i) => (
          <button
            key={row.ID || i}
            className="panel mc-card"
            onClick={() => {
              setResume(undefined);
              tab === "ability"
                ? setPaper(row)
                : setProduct({ ...row, _entitlementKind: tab });
            }}
          >
            {row.HeadImg ? (
              <img
                src={
                  String(row.HeadImg)
                    .replaceAll(".png_yjs", ".png")
                    .split(";")[0]
                }
                alt=""
                loading="lazy"
              />
            ) : (
              <div className="mc-card-art">
                {tab === "ability" ? (
                  <FileText size={32} />
                ) : (
                  <BookOpen size={32} />
                )}
              </div>
            )}
            <div className="mc-card-body">
              <span className="mc-badge">
                {tab === "ability"
                  ? "能力测评"
                  : row.BusValue || row.Type || "数学课程"}
              </span>
              <h3>{courseLabel(row)}</h3>
              {tab === "ability" ? (
                <p>
                  {row.Times ? `${courseMinutes(row.Times)} 分钟 · ` : ""}
                  {row.IsFinished
                    ? "查看报告"
                    : row.Studing
                      ? "继续测评"
                      : "开始测评"}
                </p>
              ) : (
                <p>
                  {row.TeacherName || row.Remark || "查看课程安排与学习资料"}
                </p>
              )}
              <span className="mc-link">
                {tab === "ability" ? "打开测评" : "查看课程"}
                <ChevronRight size={15} />
              </span>
            </div>
          </button>
        ))}
      </div>
      {!remote.loading && !remote.error && (
        <Pagination
          label="数学课程"
          contentRef={catalogRef}
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={all.length}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          pageSizeOptions={[12, 30, 60]}
        />
      )}
    </div>
  );
}
