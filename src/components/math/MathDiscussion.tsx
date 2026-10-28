import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import RichContent from "../RichContent";
import {
  mathCommand,
  mathData,
  mathGet,
  mathPost,
  mathRows,
} from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import { AttachmentInput } from "./MathQuestions";
import {
  discussionGivePayload,
  discussionReplyPayload,
  discussionTree,
} from "./discussion-model.mjs";
import "./MathDiscussion.css";
function useDiscussion(key: string, load: () => Promise<any>) {
  const [data, setData] = useState<any>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    load()
      .then((r) => {
        if (active) setData(r);
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
const name = (row: MathRow) =>
  String(row.UserNick || row.NickName || row.Name || "学习者");
const date = (value: any) =>
  String(value || "")
    .replace("T", " ")
    .slice(0, 16);
export default function MathDiscussion({
  qid,
  stuid,
}: {
  qid: string | number;
  stuid: string;
}) {
  const [order, setOrder] = useState("hot"),
    [page, setPage] = useState(1),
    [thread, setThread] = useState<MathRow>(),
    [reply, setReply] = useState<MathRow>(),
    [text, setText] = useState(""),
    [files, setFiles] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const limit = 20;
  const remote = useDiscussion(`comments:${qid}:${order}:${page}`, () =>
    Promise.all([
      mathGet("/api/sys_comment/GetUser", {
        ID: qid,
        limit,
        page,
        SortDesc: order === "hot" ? "" : "1",
        StuID: page === 1 && order === "hot" ? stuid : "",
      }),
      mathCommand("GetUserCommentGiveList_lt", {
        StuID: stuid,
        PID: qid,
        Type: "题目讨论区",
      }),
    ]),
  );
  const rows = remote.data ? mathRows(remote.data[0]) : [];
  const likes = new Set(
    (remote.data ? mathRows(remote.data[1]) : []).map((r) => String(r.BusID)),
  );
  async function act(work: () => Promise<any>, message = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      remote.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!text.trim() && !files.length) return;
    await act(async () => {
      const response = await mathPost(
        "/api/sys_comment/Add",
        discussionReplyPayload({ qid, stuid, text, files, target: reply }),
      );
      if (
        Number(mathData(response)) <= 0 ||
        !/^\d+$/.test(String(mathData(response)))
      )
        throw new Error(
          typeof mathData(response) === "string"
            ? mathData(response)
            : "平台未确认发布成功，请重试。",
        );
      setText("");
      setFiles([]);
      setReply(undefined);
    }, "讨论已发布");
  }
  if (thread)
    return (
      <DiscussionThread
        stuid={stuid}
        qid={qid}
        thread={thread}
        back={() => {
          setThread(undefined);
          remote.reload();
        }}
      />
    );
  return (
    <div className="md-discussion">
      <div className="md-heading">
        <h3>一起理解这道题</h3>
        <div className="tabs">
          <button
            className={order === "hot" ? "active" : ""}
            onClick={() => {
              setOrder("hot");
              setPage(1);
            }}
          >
            热门讨论
          </button>
          <button
            className={order === "new" ? "active" : ""}
            onClick={() => {
              setOrder("new");
              setPage(1);
            }}
          >
            最新讨论
          </button>
        </div>
        <button
          className="icon-button"
          aria-label="刷新题目讨论"
          onClick={remote.reload}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {remote.loading ? (
        <div className="math-state">
          <LoaderCircle className="spin" size={21} />
          <p>正在读取讨论…</p>
        </div>
      ) : remote.error ? (
        <p className="error-banner">{remote.error}</p>
      ) : !rows.length ? (
        <div className="md-empty">
          <MessageCircle size={25} />
          <p>还没有讨论，带着你的思考开启交流吧。</p>
        </div>
      ) : (
        rows.map((r, i) => (
          <div className="md-root" key={r.ID || i}>
            <Comment
              row={r}
              stuid={stuid}
              liked={likes.has(String(r.ID))}
              busy={busy}
              onReply={() => setReply({ ...r, Level: 1 })}
              onLike={() =>
                void act(() =>
                  mathPost(
                    "/api/sys_comment/give",
                    discussionGivePayload(r, likes.has(String(r.ID))),
                  ),
                )
              }
              onDelete={() => {
                if (window.confirm("删除自己的这条讨论？"))
                  void act(
                    () => mathPost("/api/sys_comment/Del", { ID: r.ID }),
                    "讨论已删除",
                  );
              }}
            />
            <div className="md-preview-replies">
              {(Array.isArray(r._sys_comment) ? r._sys_comment : [])
                .slice(0, 3)
                .map((c: MathRow, j: number) => (
                  <div key={c.ID || j}>
                    <strong>{name(c)}</strong>
                    <RichContent content={c.Txt || c.Content} />
                  </div>
                ))}
            </div>
            <button
              className="text-link md-open-thread"
              onClick={() => setThread(r)}
            >
              查看完整讨论{Number(r.Count) > 0 ? `（${r.Count} 条回复）` : ""}
              <ChevronRight size={14} />
            </button>
          </div>
        ))
      )}
      {rows.length > 0 && (
        <div className="md-pager">
          <button
            className="btn btn-secondary"
            disabled={page === 1 || remote.loading}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </button>
          <span>第 {page} 页</span>
          <button
            className="btn btn-secondary"
            disabled={rows.length < limit || remote.loading}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
      <div className="md-composer">
        {reply && (
          <div className="md-reply-target">
            回复 {name(reply)}
            <button
              className="icon-button"
              aria-label="取消回复"
              onClick={() => setReply(undefined)}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <label className="field-label">
          分享你的思路
          <textarea
            className="input"
            rows={4}
            placeholder="围绕题目，分享解题思路或提出疑问…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={6000}
          />
        </label>
        <AttachmentInput value={files} onChange={setFiles} max={6} />
        <button
          className="btn btn-primary"
          disabled={busy || (!text.trim() && !files.length)}
          onClick={() => void send()}
        >
          <Send size={15} />
          {busy ? "正在发布…" : reply ? "发布回复" : "发布讨论"}
        </button>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
function Comment({
  row,
  stuid,
  liked,
  busy,
  onReply,
  onLike,
  onDelete,
}: {
  row: MathRow;
  stuid: string;
  liked: boolean;
  busy: boolean;
  onReply: () => void;
  onLike: () => void;
  onDelete: () => void;
}) {
  const images = Array.isArray(row.Files)
    ? row.Files
    : String(row.Files || "").split(",");
  return (
    <article className="md-comment">
      <div className="md-avatar">
        {/^https?:\/\//.test(row.HeadImg || "") ? (
          <img src={row.HeadImg} alt="" />
        ) : (
          name(row).slice(0, 1)
        )}
      </div>
      <div className="md-comment-body">
        <div className="md-author">
          <strong>{name(row)}</strong>
          <small>{date(row.AddTime)}</small>
        </div>
        {row.toUserNick && <p className="md-to">回复 {row.toUserNick}</p>}
        <RichContent content={row.Txt || row.Content || row.Contexts || ""} />
        <div className="md-images">
          {images
            .filter((url: string) => /^https?:\/\//.test(url))
            .map((url: string, i: number) => (
              <a href={url} target="_blank" rel="noreferrer" key={i}>
                <img src={url} alt="讨论图片" loading="lazy" />
              </a>
            ))}
        </div>
        <div className="md-actions">
          <button
            className={liked ? "liked" : ""}
            disabled={busy}
            onClick={onLike}
            aria-label={liked ? "取消点赞" : "赞同这条讨论"}
          >
            <ThumbsUp size={14} />
            {Math.max(0, Number(row.Give) || 0)}
          </button>
          <button disabled={busy} onClick={onReply}>
            <MessageCircle size={14} />
            回复
          </button>
          {String(row.StuID) === stuid && (
            <button disabled={busy} onClick={onDelete}>
              <Trash2 size={14} />
              删除
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
function DiscussionThread({
  stuid,
  qid,
  thread,
  back,
  busType = "题目讨论区",
}: {
  stuid: string;
  qid: string | number;
  thread: MathRow;
  back: () => void;
  busType?: string;
}) {
  const [target, setTarget] = useState<MathRow>(),
    [text, setText] = useState(""),
    [files, setFiles] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const remote = useDiscussion(`thread:${thread.ID}:${qid}`, () =>
    Promise.all([
      mathCommand("GetCommentInfoByID_lt", { ID: thread.ID }),
      mathCommand("GetCommentLevelList_lt", {
        PID: thread.ID,
        BusID: qid,
        BusType: busType,
      }),
      mathCommand("GetUserCommentGiveList_lt", {
        StuID: stuid,
        PID: qid,
        Type: busType,
      }),
    ]),
  );
  const root = remote.data ? mathRows(remote.data[0])[0] : thread;
  const rows = remote.data
    ? discussionTree(mathRows(remote.data[1]), thread.ID)
    : [];
  const likes = new Set(
    (remote.data ? mathRows(remote.data[2]) : []).map((r) => String(r.BusID)),
  );
  async function act(work: () => Promise<any>, message = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      remote.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function renderComment(row: MathRow) {
    return (
      <div className="md-thread-node" key={row.ID}>
        <Comment
          row={row}
          stuid={stuid}
          liked={likes.has(String(row.ID))}
          busy={busy}
          onReply={() => setTarget(row)}
          onLike={() =>
            void act(() =>
              mathPost(
                "/api/sys_comment/give",
                discussionGivePayload(row, likes.has(String(row.ID))),
              ),
            )
          }
          onDelete={() => {
            if (window.confirm("删除自己的这条回复？"))
              void act(
                () => mathPost("/api/sys_comment/Del", { ID: row.ID }),
                "回复已删除",
              );
          }}
        />
        {row.children?.length > 0 && (
          <div className="md-nested">{row.children.map(renderComment)}</div>
        )}
      </div>
    );
  }
  return (
    <div className="md-discussion">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回讨论列表
      </button>
      {remote.loading ? (
        <div className="math-state">
          <LoaderCircle className="spin" />
          <p>正在读取完整讨论…</p>
        </div>
      ) : remote.error ? (
        <p className="error-banner">{remote.error}</p>
      ) : !root ? (
        <div className="md-empty">原讨论已被删除。</div>
      ) : (
        <>
          {renderComment(root)}
          <div className="md-thread-replies">{rows.map(renderComment)}</div>
          <div className="md-composer">
            <div className="md-reply-target">
              回复 {name(target || root)}
              {target && (
                <button
                  className="icon-button"
                  aria-label="取消指定回复"
                  onClick={() => setTarget(undefined)}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <textarea
              className="input"
              aria-label="回复讨论内容"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={6000}
            />
            <AttachmentInput value={files} onChange={setFiles} max={6} />
            <button
              className="btn btn-primary"
              disabled={busy || (!text.trim() && !files.length)}
              onClick={() =>
                void act(async () => {
                  const result = await mathPost(
                    "/api/sys_comment/Add",
                    discussionReplyPayload({
                      qid,
                      stuid,
                      text,
                      files,
                      target: target || { ...root, Level: 1 },
                      busType,
                    }),
                  );
                  if (
                    !/^\d+$/.test(String(mathData(result))) ||
                    Number(mathData(result)) <= 0
                  )
                    throw new Error("平台没有确认回复成功，请重试。");
                  setText("");
                  setFiles([]);
                  setTarget(undefined);
                }, "回复已发布")
              }
            >
              <Send size={15} />
              {busy ? "正在发布…" : "发布回复"}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
export function MathDiscussionInbox({ stuid }: { stuid: string }) {
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState<MathRow>();
  const remote = useDiscussion(`discussion-inbox:${stuid}:${page}`, () =>
    mathCommand("GetUserReplyCommentList_lt", {
      StuID: stuid,
      page: page * 20,
      limit: 20,
    }),
  );
  const rows = mathRows(remote.data);
  if (selected) {
    const root = Number(selected.Level) === 3 ? selected.PPID : selected.PID;
    return (
      <DiscussionThread
        stuid={stuid}
        qid={selected.BusID}
        busType={selected.BusType || "题目讨论区"}
        thread={{ ID: root }}
        back={() => {
          setSelected(undefined);
          remote.reload();
        }}
      />
    );
  }
  return (
    <div className="panel md-discussion">
      <div className="section-heading">
        <h2>收到的讨论回复</h2>
        <button
          className="icon-button"
          aria-label="刷新收到的回复"
          onClick={remote.reload}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {remote.loading ? (
        <div className="math-state">
          <LoaderCircle className="spin" />
        </div>
      ) : remote.error ? (
        <p className="error-banner">{remote.error}</p>
      ) : !rows.length ? (
        <div className="md-empty">
          <MessageCircle />
          <p>目前没有新的讨论回复。</p>
        </div>
      ) : (
        rows.map((r, i) => (
          <button
            key={r.ID || i}
            className="md-inbox-item"
            onClick={() => setSelected(r)}
          >
            <span className="md-avatar">{name(r).slice(0, 1)}</span>
            <div>
              <strong>{name(r)}</strong>
              <RichContent content={r.Txt || r.Content} />
              <small>
                {date(r.AddTime)} · {r.BusType || "题目讨论区"}
              </small>
            </div>
            <ChevronRight size={16} />
          </button>
        ))
      )}
      <div className="md-pager">
        <button
          className="btn btn-secondary"
          disabled={page === 0 || remote.loading}
          onClick={() => setPage((n) => n - 1)}
        >
          上一页
        </button>
        <span>第 {page + 1} 页</span>
        <button
          className="btn btn-secondary"
          disabled={rows.length < 20 || remote.loading}
          onClick={() => setPage((n) => n + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
