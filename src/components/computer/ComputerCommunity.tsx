import { useEffect, useState } from "react";
import { ArrowLeft, Check, ImagePlus, LoaderCircle, X } from "lucide-react";
import RichContent from "../RichContent";
import { useSession } from "../../lib/session";
import { recordActivity } from "../../lib/store";
import {
  computerRequest as request,
  computerUpload,
  identity,
  label,
  plain,
  records,
  safeLink,
} from "../../platforms/computer";
import type { ComputerRecord as R } from "../../platforms/computer";
function useLoad(path: string, query: R = {}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [version, setVersion] = useState(0),
    serialized = JSON.stringify(query);
  useEffect(() => {
    if (!path) {
      setData(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
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
  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
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
  return loading ? (
    <p className="computer-status" role="status">
      <LoaderCircle size={18} className="spin" />
      正在读取打卡内容…
    </p>
  ) : error ? (
    <p className="computer-error" role="alert">
      {error}
      {retry && (
        <button className="btn btn-secondary" onClick={retry}>
          重试
        </button>
      )}
    </p>
  ) : empty ? (
    <div className="empty-state">这里还没有内容</div>
  ) : null;
}
function Pager({
  page,
  setPage,
  data,
}: {
  page: number;
  setPage: (v: number) => void;
  data: any;
}) {
  const pages = Number(
    data?.pages || Math.ceil(Number(data?.total || 0) / 20) || 1,
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
        第 {page} / {pages} 页
      </span>
      <button
        className="btn btn-secondary"
        disabled={page >= pages}
        onClick={() => setPage(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}
export default function ComputerCommunity() {
  const { session } = useSession(),
    [activity, setActivity] = useState<R | null>(null),
    [tab, setTab] = useState("feed"),
    [listPage, setListPage] = useState(1),
    [order, setOrder] = useState("desc"),
    [task, setTask] = useState(""),
    [page, setPage] = useState(1),
    [content, setContent] = useState(""),
    [images, setImages] = useState<string[]>([]),
    [comments, setComments] = useState<Record<string, R[]>>({}),
    [commentDraft, setCommentDraft] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const list = useLoad("/api/user/wx/actSign/list", {
      pageNum: listPage,
      pageSize: 20,
    }),
    tasks = useLoad(activity ? "/api/user/wx/actSign/task/all/list" : "", {
      actId: activity?.id,
    }),
    feed = useLoad(activity ? "/api/user/wx/actSign/content/list" : "", {
      actId: activity?.id,
      taskId: task || undefined,
      my: tab === "my" ? 1 : undefined,
      order,
      pageNum: page,
      pageSize: 20,
    });
  const detail = useLoad(
      activity ? "/api/user/wx/actSign/detail/" + activity.id : "",
    ),
    undo = useLoad(activity ? "/api/user/wx/actSign/task/undo/list" : "", {
      actId: activity?.id,
    }),
    view = detail.data || activity,
    selectedTask = records(tasks.data).find((t) => String(t.id) === task),
    futureTask =
      selectedTask?.startTime &&
      Date.parse(String(selectedTask.startTime).replace(" ", "T")) > Date.now();
  async function act(work: () => Promise<any>, message?: string) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await work();
      if (message) setNotice(message);
      feed.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    await act(async () => {
      const result = await computerUpload(file);
      const url = result.previewUrl || result.url;
      if (url) setImages((v) => [...v, url]);
    }, "图片已上传");
  }
  async function publish() {
    if (!content.trim() && !images.length) return;
    await act(async () => {
      await request("/api/user/wx/actSign/content/submit", {}, "POST", {
        actId: activity?.id,
        taskId: task,
        content,
        image: images.join(","),
      });
      setContent("");
      setImages([]);
      tasks.reload();
      undo.reload();
      detail.reload();
      recordActivity({
        platform: "computer",
        type: "checkin",
        title: `${label(activity)} · 学习打卡`,
        path: "/study/community",
      });
    }, "打卡已发布");
  }
  return (
    <>
      <Status
        loading={loading || detail.loading}
        error={error || detail.error}
      />
      {notice && <p className="computer-notice">{notice}</p>}
      {!activity ? (
        <div className="computer-course-grid">
          <Status
            loading={list.loading}
            error={list.error}
            empty={!list.loading && !list.error && !records(list.data).length}
            retry={list.reload}
          />
          {records(list.data).map((item, i) => (
            <button
              className="panel computer-course-card"
              key={i}
              onClick={() => {
                setActivity(item);
                setPage(1);
              }}
            >
              {safeLink(item.cover) ? (
                <img src={safeLink(item.cover)} alt="" />
              ) : (
                <div className="computer-course-art">
                  <Check size={34} />
                </div>
              )}
              <div>
                <span className="computer-pill">学习打卡</span>
                <h3>{label(item)}</h3>
                <p>{plain(item.description)}</p>
                <span className="computer-dim">
                  {item.joinNum ?? 0} 人参与 · {item.signNum ?? 0} 次打卡
                </span>
              </div>
            </button>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <Pager page={listPage} setPage={setListPage} data={list.data} />
          </div>
        </div>
      ) : (
        <>
          <button
            className="computer-back"
            onClick={() => {
              setActivity(null);
              setTask("");
            }}
          >
            <ArrowLeft size={16} />
            打卡活动
          </button>
          <div className="panel">
            <h2>{label(view)}</h2>
            <RichContent content={view?.description} />
            <p className="computer-dim">
              {view?.joinNum ?? 0} 人参与 · {view?.signNum ?? 0} 次打卡 · 已完成{" "}
              {records(tasks.data).filter((t) => t.signed).length}/
              {records(tasks.data).length} 个任务
            </p>
            <div className="computer-toolbar">
              <div className="tabs">
                {[
                  ["feed", "全部动态"],
                  ["my", "我的打卡"],
                  ["tasks", "任务"],
                ].map(([id, title]) => (
                  <button
                    className={tab === id ? "active" : ""}
                    key={id}
                    onClick={() => {
                      setTab(id);
                      setPage(1);
                    }}
                  >
                    {title}
                  </button>
                ))}
              </div>
              <select
                className="input computer-select"
                aria-label="选择打卡任务"
                value={task}
                onChange={(e) => {
                  setTask(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部任务</option>
                {records(tasks.data).map((t, i) => (
                  <option key={i} value={identity(t)}>
                    {label(t)}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setOrder((v) => (v === "desc" ? "asc" : "desc"));
                  setPage(1);
                }}
              >
                时间{order === "desc" ? "从新到旧" : "从旧到新"}
              </button>
            </div>
          </div>
          {tab === "feed" && !task && records(undo.data).length > 0 && (
            <div className="panel">
              <h3>待完成任务 · {records(undo.data).length}</h3>
              <Status
                loading={undo.loading}
                error={undo.error}
                retry={undo.reload}
              />
              {records(undo.data).map((t, i) => (
                <div className="computer-list-row" key={i}>
                  <div className="computer-grow">
                    <strong>{label(t)}</strong>
                    <p>
                      {t.startTime || ""} {t.endTime ? `至 ${t.endTime}` : ""}
                    </p>
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={
                      !!t.startTime &&
                      Date.parse(String(t.startTime).replace(" ", "T")) >
                        Date.now()
                    }
                    onClick={() => setTask(identity(t))}
                  >
                    去完成
                  </button>
                </div>
              ))}
            </div>
          )}
          {tab === "tasks" ? (
            <div className="panel">
              <Status
                loading={tasks.loading}
                error={tasks.error}
                empty={
                  !tasks.loading && !tasks.error && !records(tasks.data).length
                }
                retry={tasks.reload}
              />
              {records(tasks.data).map((t, i) => (
                <div key={i} className="computer-list-row">
                  <div className="computer-grow">
                    <h3>
                      {label(t)}{" "}
                      <span className="computer-pill">
                        {t.signed
                          ? "已完成"
                          : t.startTime &&
                              Date.parse(
                                String(t.startTime).replace(" ", "T"),
                              ) > Date.now()
                            ? "尚未开始"
                            : "待完成"}
                      </span>
                    </h3>
                    <RichContent content={t.description || t.content} />
                    <p>
                      {t.startTime || ""} {t.endTime ? `至 ${t.endTime}` : ""}
                    </p>
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={
                      !!t.startTime &&
                      Date.parse(String(t.startTime).replace(" ", "T")) >
                        Date.now()
                    }
                    onClick={() => {
                      setTask(identity(t));
                      setTab("feed");
                    }}
                  >
                    去打卡
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="panel computer-publish">
                <h3>记录今天的进步</h3>
                {selectedTask && (
                  <>
                    <h4>{label(selectedTask)}</h4>
                    <RichContent
                      content={selectedTask.content || selectedTask.description}
                    />
                    {futureTask && (
                      <p className="computer-notice">
                        任务尚未开始，开始后可发布打卡。
                      </p>
                    )}
                  </>
                )}
                <textarea
                  className="input"
                  rows={3}
                  placeholder="分享学习心得或任务完成情况"
                  aria-label="打卡内容"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className="computer-publish-images">
                  {images.map((url, i) => (
                    <button
                      key={i}
                      aria-label="删除待发布图片"
                      onClick={() =>
                        setImages((v) => v.filter((_, j) => j !== i))
                      }
                    >
                      <img src={url} alt="待发布图片" />
                      <X size={15} />
                    </button>
                  ))}
                </div>
                <div className="computer-toolbar">
                  <label className="btn btn-secondary computer-upload">
                    <ImagePlus size={16} />
                    添加图片
                    <input
                      type="file"
                      accept="image/*"
                      disabled={loading}
                      onChange={(e) => void upload(e.target.files?.[0])}
                    />
                  </label>
                  <span className="computer-dim">请选择任务后发布打卡</span>
                  <button
                    className="btn btn-primary"
                    disabled={
                      loading ||
                      !task ||
                      !!futureTask ||
                      (!content.trim() && !images.length)
                    }
                    onClick={() => void publish()}
                  >
                    发布打卡
                  </button>
                </div>
              </div>
              <div className="panel">
                <Status
                  loading={feed.loading}
                  error={feed.error}
                  empty={
                    !feed.loading && !feed.error && !records(feed.data).length
                  }
                  retry={feed.reload}
                />
                {records(feed.data).map((item, i) => {
                  const own =
                    String(item.userId) ===
                    String(session.platforms.computer.user?.userId);
                  return (
                    <article className="computer-post" key={i}>
                      <div className="computer-section-label">
                        <strong>
                          {item.nickName ||
                            item.nickname ||
                            item.userName ||
                            "学习者"}
                        </strong>
                        <span>{item.createTime || ""}</span>
                      </div>
                      <RichContent content={item.content} />
                      <div className="computer-publish-images">
                        {String(item.image || "")
                          .split(",")
                          .filter(Boolean)
                          .map(
                            (url, j) =>
                              safeLink(url) && (
                                <a
                                  href={safeLink(url)}
                                  key={j}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <img src={safeLink(url)} alt="学习打卡图片" />
                                </a>
                              ),
                          )}
                      </div>
                      <div className="computer-toolbar">
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() =>
                            void act(() =>
                              request(
                                `/api/user/wx/actSign/content/${item.isLike || item.liked ? "cancel/likes" : "likes"}/${item.id}`,
                                {},
                                "POST",
                              ),
                            )
                          }
                        >
                          赞 {item.likesNum ?? item.likeNum ?? 0}
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() =>
                            void act(async () => {
                              const commentsData = await request(
                                "/api/user/wx/actSign/content/comment/list",
                                { cid: item.id, pageNum: 1, pageSize: 100 },
                              );
                              setComments((c) => ({
                                ...c,
                                [item.id]: records(commentsData),
                              }));
                            })
                          }
                        >
                          查看评论
                        </button>
                        {own && (
                          <button
                            className="btn btn-secondary"
                            disabled={loading}
                            onClick={() => {
                              if (window.confirm("删除这条打卡动态？"))
                                void act(
                                  () =>
                                    request(
                                      "/api/user/wx/actSign/content/delete/" +
                                        item.id,
                                      {},
                                      "POST",
                                    ),
                                  "动态已删除",
                                );
                            }}
                          >
                            删除
                          </button>
                        )}
                      </div>
                      {comments[item.id] && (
                        <div className="computer-comments">
                          {comments[item.id].map((c, j) => (
                            <p key={j}>
                              <strong>
                                {c.nickname || c.nickName || "学习者"}：
                              </strong>
                              {c.comment || c.content}
                            </p>
                          ))}
                        </div>
                      )}
                      <form
                        className="computer-toolbar"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(async () => {
                            await request(
                              "/api/user/wx/actSign/content/comment/add",
                              {},
                              "POST",
                              { cid: item.id, comment: commentDraft[item.id] },
                            );
                            setCommentDraft((c) => ({ ...c, [item.id]: "" }));
                            setComments((c) => ({
                              ...c,
                              [item.id]: [
                                ...(c[item.id] || []),
                                {
                                  nickname: session.account?.nickname || "我",
                                  comment: commentDraft[item.id],
                                },
                              ],
                            }));
                          }, "评论已发布");
                        }}
                      >
                        <input
                          className="input"
                          aria-label="评论内容"
                          placeholder="写下评论"
                          value={commentDraft[item.id] || ""}
                          onChange={(e) =>
                            setCommentDraft((c) => ({
                              ...c,
                              [item.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn btn-secondary"
                          disabled={loading || !commentDraft[item.id]?.trim()}
                        >
                          评论
                        </button>
                      </form>
                    </article>
                  );
                })}
                <Pager page={page} setPage={setPage} data={feed.data} />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
