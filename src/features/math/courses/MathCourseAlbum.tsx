import { invalidateCatalogResources } from "../../../shared/api/client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Heart,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { useSession } from "../../../shared/auth/session";
import { mathData, mathTitle } from "../api/math";
import type { MathRow as Row } from "../api/math";
import MathQuestionReader from "../questions/MathQuestionReader";
import MathQuestionVideo from "../questions/MathQuestionVideo";
import MathModelTraining from "../practice/MathModelTraining";
import { courseAlbumApi as api } from "./math-course-album";
import type { CourseAlbumContext } from "./math-course-album";
import { courseAlbumTree } from "./course-album-model.mjs";
import { useStudyTimer } from "../../learning/time/use-study-timer";
import "./math-course-album.css";
function useData(key: string, load: () => Promise<any>) {
  const [data, setData] = useState<any>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    load()
      .then((value) => {
        if (active) setData(value);
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
function safeUrl(value: any) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function Files({ row }: { row: Row }) {
  return (
    <div className="mca-files">
      {[
        ...new Set(
          [row.Files, row.Url, row.FileUrl, row.BusUrl]
            .flatMap((value) => String(value || "").split(/[;\n]/))
            .map(safeUrl)
            .filter(Boolean),
        ),
      ].map((url, i) => (
        <a
          className="btn btn-secondary"
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          学习资料 {i + 1}
        </a>
      ))}
    </div>
  );
}
export default function MathCourseAlbum({
  stuid,
  AlbumID,
  CourseID,
  CalendarID,
  ProductID,
  onPaper,
}: {
  stuid: string;
  AlbumID: string | number;
  CourseID: string | number;
  CalendarID: string | number;
  ProductID: string | number;
  onPaper: (paper: Row) => void;
}) {
  const context: CourseAlbumContext = {
      stuid,
      CourseID,
      CalendarID,
      ProductID,
    },
    contextKey = JSON.stringify(context),
    { session } = useSession();
  const remote = useData(`course-album-${AlbumID}-${contextKey}`, () =>
      api.load(AlbumID, context),
    ),
    [catalog, setCatalog] = useState<Row>(),
    [question, setQuestion] = useState<Row>(),
    [group, setGroup] = useState<Row>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [position, setPosition] = useState<string | number>(0),
    [log, setLog] = useState<Row>({});
  const info: Row = remote.data?.info || {},
    catalogs: Row[] = remote.data?.catalogs || [];
  const reading = useData(
    `course-album-chapter-${catalog?.ID || 0}-${contextKey}`,
    () =>
      catalog
        ? api.chapter(AlbumID, catalog.ID, context)
        : Promise.resolve({ rows: [], log: {}, likes: {} }),
  );
  const operations = useData(
    `course-album-work-${catalog?.ID || 0}-${contextKey}-${reading.data?.rows ? JSON.stringify(reading.data.rows.map((r: Row) => r.ID)) : ""}`,
    () =>
      reading.data?.rows?.length
        ? api.operations(reading.data.rows, context)
        : Promise.resolve({}),
  );
  useStudyTimer({
    key: `math-course-album:${stuid}:${CourseID}:${CalendarID}:${AlbumID}:${catalog?.ID || ""}`,
    platform: "math",
    title: `${mathTitle(info)} · ${catalog ? mathTitle(catalog) : "课程专辑"}`,
    path: "/study/courses",
    enabled: !!catalog && !question && !group && !remote.loading && !remote.error && !reading.loading && !reading.error && !!reading.data?.rows?.length,
  });
  useEffect(() => {
    if (catalogs.length === 1 && !catalog) setCatalog(catalogs[0]);
  }, [remote.data]);
  useEffect(() => {
    if (reading.data) {
      setLog(reading.data.log || {});
      setPosition(reading.data.log?.BusID || 0);
    }
  }, [reading.data]);
  async function savePosition(BusID: string | number) {
    if (!catalog) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.save(context, AlbumID, catalog.ID, BusID, log),
        value = mathData(result);
      setLog((old) => ({
        ...old,
        ID: Number(value) > 0 ? value : old.ID,
        BusID,
      }));
      setPosition(BusID);
      setNotice("本章阅读位置已同步。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function like() {
    if (!catalog) return;
    setBusy(true);
    setError("");
    try {
      await api.like(context, AlbumID, catalog.ID, reading.data?.likes || {});
      reading.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (group && catalog)
    return (
      <MathModelTraining
        stuid={stuid}
        kind="album"
        albumId={group.AlbumID || AlbumID}
        catalogId={group.CatalogID || catalog.ID}
        groupId={group.ID}
        context={{ ProductID, CourseID, CalendarID }}
        onClose={() => {
          setGroup(undefined);
          reading.reload();
        }}
      />
    );
  if (question)
    return (
      <>
        <button className="math-back" onClick={() => setQuestion(undefined)}>
          <ArrowLeft size={15} />
          返回课程专辑
        </button>
        <MathQuestionReader
          row={question}
          stuid={stuid}
          isCourse={false}
        />
      </>
    );
  const likes = reading.data?.likes || {};
  function render(nodes: Row[], parent?: Row): any {
    return nodes.map((row, index) => {
      const type = row.Type || parent?.Type,
        teacher = Number(parent?.BusValue ?? row.BusValue) === 1,
        workGroup = row.Type === "作业" && row.children?.length,
        paper = workGroup ? row.children[0] : row,
        hasPaper = workGroup || (type === "作业" && row.BusID),
        status = Number(operations.data?.[String(paper.BusID)] || 0),
        exercise =
          type === "习题" &&
          (row.children?.length || row.QuestionID) &&
          parent?.Type !== "习题",
        qid = row.QuestionID || row.BusID;
      return (
        <article
          key={`${row.ID}-${index}`}
          id={`course-album-${row.ID}`}
          className={`mca-content ${String(position) === String(row.ID) ? "last" : ""}`}
        >
          <div className="mca-content-heading">
            <h4>{row.Title || row.Name || type || ""}</h4>
            <button
              className="mca-position"
              disabled={busy}
              onClick={() => void savePosition(row.ID)}
            >
              {String(position) === String(row.ID) ? (
                <>
                  <Check size={12} />
                  上次读到
                </>
              ) : (
                "保存到这里"
              )}
            </button>
          </div>
          {type !== "习题" && (
            <RichContent
              content={row.Content || row.QuestionTxt || row.Notes}
            />
          )}
          <Files row={row} />
          {row.BusType === "视频" && (
            <MathQuestionVideo
              row={{
                ...row,
                PolyvVID: row.PlayVid || row.PolyvVID || row.BusValue,
              }}
            />
          )}
          {row.BusType === "题目" && type !== "习题" && qid && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                void savePosition(row.ID);
                setQuestion({ ...row, QuestionID: qid });
              }}
            >
              查看完整题目与解析
              <ChevronRight size={14} />
            </button>
          )}
          {exercise && (
            <button
              className="btn btn-primary"
              onClick={() => {
                void savePosition(row.ID);
                setGroup(row);
              }}
            >
              开始本组习题
              <ChevronRight size={14} />
            </button>
          )}
          {hasPaper && (
            <div className="mca-work">
              <span>
                {teacher ? "人工阅卷作业" : "自评作业"} ·{" "}
                {status === 2
                  ? "已完成"
                  : status === 1
                    ? teacher
                      ? "等待批阅"
                      : "继续作答"
                    : "尚未开始"}
              </span>
              <button
                className="btn btn-primary"
                onClick={() => {
                  void savePosition(row.ID);
                  onPaper({
                    ...paper,
                    CourseID,
                    CalendarID,
                    ProductID,
                    BusType: teacher ? 6 : 3,
                  });
                }}
              >
                {status === 2 ? "查看成绩" : "打开作业"}
              </button>
            </div>
          )}
          {!exercise &&
            !workGroup &&
            row.children?.length > 0 &&
            render(row.children, row)}
        </article>
      );
    });
  }
  return (
    <section className="math-course-album">
      {Object.values(remote.data?.errors || {}).filter(Boolean).map((message, index) => <p className="mc-error" role="status" key={`overview-${index}`}>{String(message)}</p>)}
      {Object.values(reading.data?.errors || {}).filter(Boolean).map((message, index) => <p className="mc-error" role="status" key={`chapter-${index}`}>{String(message)}</p>)}
      {remote.loading ? (
        <div className="mc-status">
          <LoaderCircle size={19} className="spin" />
          正在读取课程专辑…
        </div>
      ) : remote.error ? (
        <p className="mc-error">
          {remote.error}
          <button className="btn btn-secondary" onClick={remote.reload}>
            重试
          </button>
        </p>
      ) : catalog ? (
        <>
          <button
            className="math-back"
            onClick={() => {
              setCatalog(undefined);
              setNotice("");
              setError("");
            }}
          >
            <ArrowLeft size={15} />
            专辑章节目录
          </button>
          <div className="mc-heading">
            <h3>{mathTitle(catalog)}</h3>
            <div className="mca-actions">
              <button
                className="btn btn-secondary"
                disabled={busy || reading.loading}
                onClick={like}
              >
                <Heart
                  size={14}
                  fill={likes.MyLogID ? "currentColor" : "none"}
                />
                {likes.MyLogID ? "已赞" : "点赞"} {likes.counts || 0}
              </button>
              <button
                className="math-icon-button"
                aria-label="刷新专辑内容"
                onClick={() => {
                  reading.reload();
                  operations.reload();
                }}
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
          {reading.loading ? (
            <div className="mc-status">
              <LoaderCircle size={19} className="spin" />
              正在读取章节内容…
            </div>
          ) : reading.error ? (
            <p className="mc-error">{reading.error}</p>
          ) : (
            <>
              {operations.error && (
                <p className="mc-error">作业进度暂未读取：{operations.error}</p>
              )}
              {(reading.data?.rows || []).map((section: Row, index: number) => (
                <section key={section.ID || index}>
                  <h3>{section.Title || section.Name || ""}</h3>
                  {render(courseAlbumTree(section.ContentList || []))}
                </section>
              ))}
              {!reading.data?.rows?.length && !reading.data?.errors?.content && (
                <p className="mc-status">本章暂无学习内容。</p>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <h3>{info.Title || info.Name || "课程专辑"}</h3>
          <RichContent content={info.Notes || info.Intro || info.Content} />
          <div className="mca-intro-images">
            {String(info.IntroImg || "")
              .replaceAll(".png_yjs", ".png")
              .split(",")
              .map(safeUrl)
              .filter(Boolean)
              .map((url) => (
                <img src={url} alt="专辑介绍" key={url} loading="lazy" />
              ))}
          </div>
          <div className="mca-catalogs">
            {catalogs.map((row) => (
              <button
                key={row.ID}
                onClick={() => {
                  setCatalog(row);
                  setNotice("");
                  setError("");
                }}
              >
                <BookOpen size={18} />
                <span>
                  <strong>{mathTitle(row)}</strong>
                  {remote.data.progress.some(
                    (p: Row) => String(p.CatalogID) === String(row.ID),
                  ) && <small>已有阅读记录</small>}
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          {!catalogs.length && (
            <p className="mc-status">本专辑暂未建立章节。</p>
          )}
        </>
      )}
      {notice && (
        <p className="mc-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="mc-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
