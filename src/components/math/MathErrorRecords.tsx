import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CircleHelp,
  Image,
  LoaderCircle,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from "lucide-react";
import RichContent from "../RichContent";
import { mathData, mathRows } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import {
  acknowledgedErrorVote,
  errorEvidence,
  errorRecord,
} from "./error-records-model.mjs";
import { mathErrorRecordsApi as api } from "./math-error-records";
import "./MathErrorRecords.css";

export default function MathErrorRecords({
  stuid,
  qid,
}: {
  stuid: string;
  qid: string | number;
}) {
  const [page, setPage] = useState(0),
    [rows, setRows] = useState<MathRow[]>([]),
    [busy, setBusy] = useState(true),
    [voting, setVoting] = useState<string>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    setPage(0);
    setNotice("");
  }, [qid, stuid]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    api
      .list(qid, page)
      .then((result) => {
        if (active) setRows(mathRows(result));
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [qid, stuid, page, version]);
  const vote = async (row: MathRow, state: number) => {
    if (voting || Number(row.DianzanState) === state) return;
    setVoting(String(row.ID));
    setNotice("");
    setError("");
    try {
      const result = await api.vote(row, stuid, state);
      if (result) {
        setRows((old) =>
          old.map((item) =>
            item.ID === row.ID
              ? acknowledgedErrorVote(item, state, mathData(result))
              : item,
          ),
        );
        setNotice("你的判断已同步，正在更新反馈统计。");
        setVersion((v) => v + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVoting(undefined);
    }
  };
  return (
    <section className="math-error-records" aria-label="已有题目纠错反馈">
      <div className="merr-heading">
        <div>
          <h4>已有纠错反馈</h4>
          <p>查看同学提交的依据，判断反馈是否准确。</p>
        </div>
        <button
          className="math-icon-button"
          disabled={busy || !!voting}
          aria-label="刷新已有纠错反馈"
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {notice && (
        <p className="merr-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="merr-error" role="alert">
          <span>{error}</span>
          <button disabled={busy} onClick={() => setVersion((v) => v + 1)}>
            重试读取
          </button>
        </div>
      )}
      {busy ? (
        <div className="merr-state">
          <LoaderCircle className="spin" size={21} />
          正在读取题目反馈…
        </div>
      ) : !rows.length && !error ? (
        <div className="merr-state">
          <CircleHelp size={28} />
          <p>这道题目前还没有纠错反馈。</p>
        </div>
      ) : (
        <div className="merr-list">
          {rows.map((item, index) => {
            const row = errorRecord(item),
              avatar = errorEvidence(row.HeadImg)[0],
              selected = Number(row.DianzanState);
            return (
              <article className="merr-record" key={row.ID || index}>
                <div className="merr-record-head">
                  {avatar ? (
                    <img
                      className="merr-avatar"
                      src={avatar}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className="merr-avatar">
                      <UserRound size={19} />
                    </span>
                  )}
                  <div>
                    <strong>{row.UserNick || "小欧"}</strong>
                    <time>
                      {String(row.AddTime || "")
                        .replace("T", " ")
                        .slice(0, 16)}
                    </time>
                  </div>
                  <span
                    className={`merr-status ${Number(row.Type) === 1 ? "accepted" : ""}`}
                  >
                    {Number(row.Type) === 1 && <BadgeCheck size={12} />}{" "}
                    {row.status}
                  </span>
                </div>
                <div className="merr-body">
                  {(row.Title || row.BaseType || row.BusValue) && (
                    <div className="merr-topic">
                      {row.BaseType && <small>{row.BaseType}</small>}
                      <strong>{row.Title || row.BusValue}</strong>
                    </div>
                  )}
                  {row.Content && <RichContent content={row.Content} />}
                  <Evidence title="错误位置与证据" images={row.evidence} />
                  <Evidence
                    title="建议的正确解答"
                    images={row.answerEvidence}
                  />
                </div>
                <div className="merr-votes">
                  <span>这条反馈是否准确？</span>
                  <button
                    className={selected === 1 ? "active" : ""}
                    aria-pressed={selected === 1}
                    disabled={!stuid || !!voting || busy || selected === 1}
                    onClick={() => vote(item, 1)}
                  >
                    {voting === String(row.ID) ? (
                      <LoaderCircle className="spin" size={13} />
                    ) : (
                      <ThumbsUp size={13} />
                    )}
                    正确 <b>{row.rightCount}</b>
                  </button>
                  <button
                    className={selected === 2 ? "active" : ""}
                    aria-pressed={selected === 2}
                    disabled={!stuid || !!voting || busy || selected === 2}
                    onClick={() => vote(item, 2)}
                  >
                    <ThumbsDown size={13} />
                    不正确 <b>{row.errorCount}</b>
                  </button>
                  {selected > 0 && (
                    <small>你已选择{selected === 1 ? "正确" : "不正确"}</small>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="merr-pagination">
        <button
          className="btn btn-secondary"
          disabled={page === 0 || busy || !!voting}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </button>
        <span>第 {page + 1} 页</span>
        <button
          className="btn btn-secondary"
          disabled={rows.length < 10 || busy || !!voting || !!error}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
    </section>
  );
}
function Evidence({ title, images }: { title: string; images: string[] }) {
  if (!images.length) return null;
  return (
    <div className="merr-evidence">
      <p>
        <Image size={12} />
        {title}
      </p>
      <div>
        {images.map((url) => (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            key={url}
            aria-label={`打开${title}图片`}
          >
            <img src={url} alt={title} loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}
