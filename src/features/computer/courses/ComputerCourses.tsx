import ComputerCourseDanmaku from "./ComputerCourseDanmaku";
import Pagination from "../../../shared/ui/pagination/Pagination";
import { usePagination } from "../../../shared/ui/pagination/use-pagination";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileText,
  LoaderCircle,
  MessageCircle,
  Play,
  RefreshCw,
  Video,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import LearningVideo from "../../../shared/media/LearningVideo";
import { recordActivity } from "../../learning/state/store";
import {
  computerRequest as request,
  label,
  plain,
  records,
  safeLink,
} from "../api/computer";
import type { ComputerRecord as R } from "../api/computer";
import {
  courseAttachments,
  lessonProgress,
  maskCourseReviewer,
  orderedSubcourses,
  studyCourseId,
} from "./course-model.mjs";
import "./ComputerCourses.css";
function useResource(path: string, query: R = {}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [version, setVersion] = useState(0);
  const serialized = JSON.stringify(query);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
  return { data, error, loading, reload: () => setVersion((n) => n + 1) };
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
      <div className="computer-status">
        <LoaderCircle className="spin" size={21} />
        正在读取课程内容…
      </div>
    );
  if (error)
    return (
      <div className="error-banner">
        <span>{error}</span>
        {retry && (
          <button className="text-link" onClick={retry}>
            重试
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="empty-state">
        <BookOpen size={30} />
        <h3>当前还没有课程内容</h3>
        <p>可以切换分类，或选择其他课程继续学习。</p>
      </div>
    );
  return null;
}
export default function ComputerCourses() {
  const catalogRef = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState("catalog"),
    [courseType, setCourseType] = useState("all"),
    [course, setCourse] = useState<R | null>(null),
    [subcourse, setSubcourse] = useState(""),
    [lesson, setLesson] = useState<R | null>(null),
    [lessonPage, setLessonPage] = useState(1),
    [commentPage, setCommentPage] = useState(1),
    [tab, setTab] = useState("introduction"),
    [video, setVideo] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [rate, setRate] = useState("1"),
    [search, setSearch] = useState("");
  const list = useResource(
    "/api/exam/wx/course/courseList",
    scope === "joined" ? { type: 1, scene: "joined" } : {},
  );
  const groupCourseId = studyCourseId(course, subcourse);
  const lessons = useResource(course ? "/api/exam/wx/lesson/lessonList" : "", {
    courseId: groupCourseId,
    pageNum: lessonPage,
    pageSize: 100,
    sort: "sort",
    order: " asc",
  });
  const detail = useResource(course ? "/api/exam/pc/course/detail" : "", {
    id: course?.id,
    courseCode: course?.courseCode,
  });
  const comments = useResource(
    course && tab === "comments" ? "/api/exam/wx/course/comment/list" : "",
    { courseId: course?.id, pageNum: commentPage, pageSize: 50 },
  );
  const videoRef = useRef<HTMLVideoElement>(null),
    lastSave = useRef(0),
    playStart = useRef(0),
    studySeconds = useRef(0);
  const subcourses = course ? orderedSubcourses(course) : [];
  const files = courseAttachments(lesson, detail.data);
  const lessonRows = records(lessons.data);
  const lessonPages = Number(
    lessons.data?.pages ||
      Math.ceil(Number(lessons.data?.total || 0) / 100) ||
      1,
  );
  const commentRows = records(comments.data);
  const commentPages = Number(
    comments.data?.pages ||
      Math.ceil(Number(comments.data?.total || 0) / 50) ||
      1,
  );
  async function play(item: R) {
    const directUrl = safeLink(item.videoUrl || item.playUrl);
    if (!String(item.mediaId || "").trim() && !directUrl) {
      setError("平台未返回此课时的播放地址或媒体编号。");
      return;
    }
    setLoading(true);
    setError("");
    if (videoRef.current && lesson) await saveProgress(videoRef.current, true);
    setVideo("");
    setNotice("");
    setLesson({ ...item, _studyCourseId: groupCourseId });
    try {
      const data = directUrl ? null : await request(
        item.storagePlatform === "Tencent"
          ? "/api/exam/wx/course/vod/get_play_info"
          : "/api/exam/wx/course/get_play_info/v2",
        { mediaId: String(item.mediaId || "").trim(), format: "m3u8" },
      );
      const url = directUrl || safeLink(
        Array.isArray(data)
          ? data[0]?.url
          : data?.mediaList?.[0]?.playURL || data?.url || data?.playUrl,
      );
      if (!url) throw new Error("平台暂未返回可用播放地址，请稍后重试。");
      setVideo(url);
      lastSave.current = Number(item.watchHistoryTime || 0);
      studySeconds.current = 0;
      playStart.current = 0;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function saveProgress(element: HTMLVideoElement, force = false) {
    if (!lesson || !course) return;
    const now = Date.now();
    const elapsed =
      studySeconds.current +
      (playStart.current ? (now - playStart.current) / 1000 : 0);
    if (!elapsed && element.currentTime === lastSave.current) return;
    if (!force && element.currentTime - lastSave.current < 30) return;
    lastSave.current = element.currentTime;
    studySeconds.current = 0;
    playStart.current = element.paused ? 0 : now;
    const payload = lessonProgress({
      lesson,
      courseId: groupCourseId,
      position: element.currentTime,
      duration: element.duration,
      elapsed,
    });
    if (elapsed >= 1)
      recordActivity({
        platform: "computer",
        type: "course",
        title: label(lesson),
        durationSeconds: Math.round(elapsed),
        path: "/study/courses",
      });
    try {
      await request("/api/exam/wx/lessonHistory/add/", {}, "POST", payload);
      setNotice("学习进度已同步");
    } catch (e: any) {
      setError(`学习进度保存失败：${e.message}`);
    }
  }
  const items = records(list.data)
    .flatMap((item) =>
      Array.isArray(item.courseList) ? item.courseList : [item],
    )
    .filter(
      (item) =>
        (scope === "joined" || courseType === "all" || Number(item.courseType) === Number(courseType)) &&
        (!search ||
          `${label(item)} ${item.courseBrief || ""}`.includes(search)),
    );
  const catalogPagination = usePagination({
    total: items.length,
    pageSize: 12,
    resetKey: JSON.stringify([scope, courseType, search]),
  });
  async function back() {
    if (videoRef.current) await saveProgress(videoRef.current, true);
    setCourse(null);
    setVideo("");
    setLesson(null);
    setError("");
    setNotice("");
  }
  return (
    <div className="cc-courses">
      <Status loading={loading} error={error} />
      {!course ? (
        <>
          <div className="panel computer-toolbar">
            <div className="tabs">
              <button
                className={scope === "joined" ? "active" : ""}
                onClick={() => setScope("joined")}
              >
                我的课程
              </button>
              <button
                className={scope === "catalog" ? "active" : ""}
                onClick={() => setScope("catalog")}
              >
                课程与学习资料
              </button>
            </div>
            {scope === "catalog" && (
              <select
                className="input computer-select"
                aria-label="课程学习分类"
                value={courseType}
                onChange={(e) => setCourseType(e.target.value)}
              >
                {[
                  ["all", "全部学习内容"],
                  ["7", "学习与公开课"],
                  ["4", "408统考"],
                  ["5", "自命题"],
                  ["8", "名校预备课"],
                  ["2", "配套课程"],
                ].map(([value, name]) => (
                  <option value={value} key={value}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <input
              className="input"
              aria-label="搜索计算机课程"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索课程名称或简介"
            />
          </div>
          <Status
            loading={list.loading}
            error={list.error}
            empty={!list.loading && !list.error && !items.length}
            retry={list.reload}
          />
          <div className="computer-course-grid pagination-content" ref={catalogRef}>
            {items.slice(catalogPagination.start, catalogPagination.end).map((item, i) => (
              <button
                className="panel computer-course-card"
                key={item.id || i}
                onClick={() => {
                  setCourse(item);
                  setSubcourse("");
                  setLessonPage(1);
                  setCommentPage(1);
                  setTab("introduction");
                  setLesson(null);
                  setVideo("");
                  setError("");
                  setNotice("");
                }}
              >
                {safeLink(item.cover || item.courseCover || item.previewUrl) ? (
                  <img
                    src={safeLink(
                      item.cover || item.courseCover || item.previewUrl,
                    )}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <div className="computer-course-art">
                    <BookOpen size={35} />
                  </div>
                )}
                <div>
                  <span className="computer-pill">
                    {scope === "joined" || item.own ? "已加入学习" : "课程目录"}
                  </span>
                  <h3>{label(item)}</h3>
                  <p>
                    {plain(
                      item.courseBrief || item.description || item.courseDesc,
                    ) || "查看课程介绍、课时与学习资料"}
                  </p>
                  <span className="computer-text-link">
                    进入课程
                    <ArrowRight size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          {!list.loading && !list.error && (
            <Pagination
              label="计算机课程"
              contentRef={catalogRef}
              page={catalogPagination.page}
              pageSize={catalogPagination.pageSize}
              total={items.length}
              onPageChange={catalogPagination.setPage}
              onPageSizeChange={catalogPagination.setPageSize}
              pageSizeOptions={[12, 24, 48]}
            />
          )}
        </>
      ) : (
        <>
          <button
            className="computer-back"
            disabled={loading}
            onClick={() => void back()}
          >
            <ArrowLeft size={17} />
            全部课程
          </button>
          <div className="cc-course-title">
            <div>
              <p className="eyebrow">CONTINUE YOUR LEARNING</p>
              <h2>{label(course)}</h2>
              <p>{plain(course.courseBrief || course.description || "")}</p>
            </div>
          </div>
          <div className="computer-course-layout">
            <div className="panel computer-player">
              <h3>{label(lesson || course)}</h3>
              {video ? (
                <>
                  <LearningVideo
                    ref={videoRef}
                    key={video}
                    src={video}
                    controls
                    playsInline
                    onLoadedMetadata={(e) => {
                      e.currentTarget.currentTime = Number(
                        lesson?.watchHistoryTime || 0,
                      );
                      e.currentTarget.playbackRate = Number(rate);
                    }}
                    onPlay={() => {
                      playStart.current = Date.now();
                    }}
                    onTimeUpdate={(e) => void saveProgress(e.currentTarget)}
                    onPause={(e) => {
                      void saveProgress(e.currentTarget, true);
                      playStart.current = 0;
                    }}
                    onEnded={(e) => void saveProgress(e.currentTarget, true)}
                    onError={() =>
                      setError("视频暂时无法加载，请重新选择课时后重试。")
                    }
                  />
                  {lesson && (
                    <ComputerCourseDanmaku
                      lesson={lesson}
                      videoRef={videoRef}
                    />
                  )}
                  <div className="computer-toolbar">
                    <label>
                      播放速度
                      <select
                        className="input computer-select"
                        aria-label="播放速度"
                        value={rate}
                        onChange={(e) => {
                          setRate(e.target.value);
                          if (videoRef.current)
                            videoRef.current.playbackRate = Number(
                              e.target.value,
                            );
                        }}
                      >
                        {["0.75", "1", "1.25", "1.5", "2"].map((v) => (
                          <option key={v} value={v}>
                            {v}×
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        if (videoRef.current)
                          void saveProgress(videoRef.current, true);
                      }}
                    >
                      保存进度
                    </button>
                    <a
                      className="computer-text-link"
                      href={video}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开视频地址
                    </a>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <Play size={33} />
                  <p>从课时目录选择内容，继续你的学习。</p>
                </div>
              )}
              {notice && (
                <p className="computer-notice" role="status">
                  {notice}
                </p>
              )}
              <div className="tabs cc-details-tabs">
                {[
                  ["introduction", "课程介绍"],
                  ["files", "课程资料"],
                  ["comments", "学员评价"],
                ].map(([value, text]) => (
                  <button
                    className={tab === value ? "active" : ""}
                    key={value}
                    onClick={() => setTab(value)}
                  >
                    {text}
                  </button>
                ))}
              </div>
              {tab === "introduction" ? (
                <div className="cc-introduction">
                  {safeLink(
                    course.courseDetail || detail.data?.courseDetail,
                  ) ? (
                    <img
                      src={safeLink(
                        course.courseDetail || detail.data?.courseDetail,
                      )}
                      alt="课程详细介绍"
                      loading="lazy"
                    />
                  ) : (
                    <RichContent
                      content={
                        course.courseDesc ||
                        detail.data?.description ||
                        detail.data?.courseDesc ||
                        course.courseBrief
                      }
                    />
                  )}
                </div>
              ) : tab === "files" ? (
                <div className="cc-files">
                  {files.length ? files.map((file, i) => (
                    <a className="computer-file-link" href={file.url} key={i} target="_blank" rel="noreferrer">
                      <FileText size={16} />{file.name}<ArrowRight size={14} />
                    </a>
                  )) : (
                    <div className="cc-small-empty"><FileText size={25} /><p>{lesson ? "当前课时没有附带课件。" : "选择具体课时后查看所附资料。"}</p></div>
                  )}
                </div>
              ) : (
                <div className="cc-reviews">
                  <Status
                    loading={comments.loading}
                    error={comments.error}
                    empty={
                      !comments.loading &&
                      !comments.error &&
                      !commentRows.length
                    }
                    retry={comments.reload}
                  />
                  {commentRows.map((c, i) => (
                    <article className="cc-review" key={c.id || i}>
                      <div className="cc-review-head">
                        {safeLink(c.avatar) && (
                          <img src={safeLink(c.avatar)} alt="" />
                        )}
                        <div>
                          <strong>
                            {maskCourseReviewer(c.name || c.nickName)}
                          </strong>
                          <small>
                            {c.schoolName ? `目标院校：${c.schoolName}` : ""}
                          </small>
                        </div>
                        <span>
                          {Number(c.commentorStatus) === 1
                            ? "已上岸"
                            : "备考中"}
                        </span>
                      </div>
                      <RichContent content={c.content} />
                      <div className="cc-review-images">
                        {String(c.imgList || "")
                          .split(",")
                          .map(
                            (url, j) =>
                              safeLink(url) && (
                                <a
                                  href={safeLink(url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  key={j}
                                >
                                  <img
                                    src={safeLink(url)}
                                    alt="学员评价图片"
                                    loading="lazy"
                                  />
                                </a>
                              ),
                          )}
                      </div>
                    </article>
                  ))}
                  {commentPages > 1 && (
                    <div className="cc-pagination">
                      <button
                        className="btn btn-secondary"
                        disabled={commentPage <= 1 || comments.loading}
                        onClick={() => setCommentPage((p) => p - 1)}
                      >
                        上一页
                      </button>
                      <span>
                        {commentPage} / {commentPages}
                      </span>
                      <button
                        className="btn btn-secondary"
                        disabled={
                          commentPage >= commentPages || comments.loading
                        }
                        onClick={() => setCommentPage((p) => p + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <aside className="panel computer-lesson-list">
              <h3>课程目录</h3>
              {subcourses.length > 1 && (
                <select
                  className="input"
                  aria-label="选择分课程"
                  value={groupCourseId}
                  onChange={(e) => {
                    setSubcourse(e.target.value);
                    setLessonPage(1);
                  }}
                >
                  {subcourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {label(c)}
                    </option>
                  ))}
                </select>
              )}
              <Status
                loading={lessons.loading}
                error={lessons.error}
                empty={!lessons.loading && !lessons.error && !lessonRows.length}
                retry={lessons.reload}
              />
              {lessonRows.map((item, i) => (
                <div className="cc-lesson-row" key={item.id || i}>
                  <button
                    className={`computer-lesson ${lesson?.id === item.id ? "active" : ""}`}
                    disabled={loading}
                    onClick={() => void play(item)}
                  >
                    <Play size={15} />
                    <div>
                      <strong>{label(item)}</strong>
                      <span>
                        {item.progress || "尚未学习"}{" "}
                        {!item.mediaId && !safeLink(item.videoUrl || item.playUrl) ? " · 暂无视频地址" : ""}
                      </span>
                    </div>
                  </button>
                  {records(item.attachmentList).length > 0 && (
                    <details className="cc-lesson-files">
                      <summary>
                        课件 · {records(item.attachmentList).length}
                      </summary>
                      {courseAttachments(item, null).map((file, j) => (
                        <a href={file.url} key={j} target="_blank" rel="noreferrer"><FileText size={12} />{file.name}</a>
                      ))}
                    </details>
                  )}
                </div>
              ))}
              {lessonPages > 1 && (
                <div className="cc-pagination">
                  <button
                    className="btn btn-secondary"
                    disabled={lessonPage <= 1 || lessons.loading}
                    onClick={() => setLessonPage((p) => p - 1)}
                  >
                    上一页
                  </button>
                  <span>
                    {lessonPage} / {lessonPages}
                  </span>
                  <button
                    className="btn btn-secondary"
                    disabled={lessonPage >= lessonPages || lessons.loading}
                    onClick={() => setLessonPage((p) => p + 1)}
                  >
                    下一页
                  </button>
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
