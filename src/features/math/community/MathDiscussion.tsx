import { loadDiscussionPage } from "./discussion-data.mjs";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import {
  mathCommand,
  mathGet,
  mathRows,
} from "../api/math";
import type { MathRow } from "../api/math";
import { discussionTree } from "./discussion-model.mjs";
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
    [thread, setThread] = useState<MathRow>();
  const limit = 20;
  const remote = useDiscussion(`comments:${qid}:${order}:${page}`, () =>
    loadDiscussionPage({
      get: mathGet,
      command: mathCommand,
      qid,
      stuid,
      order,
      page,
      limit,
    }),
  );
  const rows = mathRows(remote.data);
  if (thread)
    return (
      <DiscussionThread
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
            className={order === "hot" ? "active" : ""} aria-pressed={order === "hot"}
            onClick={() => {
              setOrder("hot");
              setPage(1);
            }}
          >
            热门讨论
          </button>
          <button
            className={order === "new" ? "active" : ""} aria-pressed={order === "new"}
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
          <p>这道题暂时没有讨论。</p>
        </div>
      ) : (
        rows.map((r, i) => (
          <div className="md-root" key={r.ID || i}>
            <Comment row={r} />
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
    </div>
  );
}
function Comment({ row }: { row: MathRow }) {
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
      </div>
    </article>
  );
}
function DiscussionThread({
  qid,
  thread,
  back,
  busType = "题目讨论区",
}: {
  qid: string | number;
  thread: MathRow;
  back: () => void;
  busType?: string;
}) {
  const remote = useDiscussion(`thread:${thread.ID}:${qid}`, () =>
    Promise.all([
      mathCommand("GetCommentInfoByID_lt", { ID: thread.ID, t: Date.now() }),
      mathCommand("GetCommentLevelList_lt", {
        PID: thread.ID,
        t: Date.now(),
        BusID: qid,
        BusType: busType,
      }),
    ]),
  );
  const root = remote.data ? mathRows(remote.data[0])[0] : thread;
  const rows = remote.data
    ? discussionTree(mathRows(remote.data[1]), thread.ID)
    : [];
  function renderComment(row: MathRow) {
    return (
      <div className="md-thread-node" key={row.ID}>
        <Comment row={row} />
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
        </>
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
