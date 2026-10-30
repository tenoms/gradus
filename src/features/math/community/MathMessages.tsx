import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { mathApi, mathGet, mathRows } from "../api/math";
import type { MathRow } from "../api/math";
import { mathMessageTarget } from "./math-messages";
import "./math-messages.css";
export default function MathMessages({
  stuid,
  onQuestion,
}: {
  stuid: string;
  onQuestion: (row: MathRow) => void;
}) {
  const [page, setPage] = useState(1),
    [category, setCategory] = useState("全部"),
    [rows, setRows] = useState<MathRow[]>([]),
    [current, setCurrent] = useState<MathRow>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const pageSize = 30;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    mathGet("/api/sys_msg_push/GetListByPagev2", {
      StuID: stuid,
      page,
      limit: pageSize,
      SortDesc: "AddTime desc",
      ...(category === "全部" ? {} : { BusType: category }),
    })
      .then((r) => {
        if (active) setRows(mathRows(r));
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
  }, [stuid, page, category, version]);
  const reload = () => setVersion((v) => v + 1);
  const open = async (row: MathRow) => {
    setCurrent(row);
    if (!Number(row.IsRead))
      try {
        await mathApi.readMessage(row.ID, stuid);
        setCurrent({ ...row, IsRead: 1 });
        reload();
      } catch (e: any) {
        setError(e.message);
      }
  };
  const target = current ? mathMessageTarget(current) : undefined;
  return (
    <div className="math-workspace">
      <div className="panel">
        <div className="math-toolbar">
          <select
            className="input mrq-status"
            value={category}
            aria-label="学习消息分类"
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            {[
              "全部",
              "系统消息",
              "系统通知",
              "讨论回复",
              "题目报错",
              "专题报错",
              "阅卷完毕通知",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw size={15} />
            刷新
          </button>
          <span className="math-count">第 {page} 页</span>
        </div>
        {loading ? (
          <div className="math-state">
            <LoaderCircle className="spin" size={23} />
            <p>正在读取学习消息…</p>
          </div>
        ) : error ? (
          <div className="math-state math-error">
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={reload}>
              重新加载
            </button>
          </div>
        ) : !rows.length ? (
          <div className="math-state">
            <MessageSquare size={28} />
            <p>当前分类暂无学习消息</p>
          </div>
        ) : (
          <div className="math-content-list">
            {rows.map((r, i) => (
              <button key={r.ID || i} onClick={() => open(r)}>
                <div
                  className={`math-list-icon ${Number(r.IsRead) ? "" : "unread"}`}
                >
                  <MessageSquare size={19} />
                </div>
                <span>
                  <strong>
                    {r.Title || r.Name || r.BusType || "平台通知"}
                  </strong>
                  <small>
                    {String(r.AddTime || "")
                      .replace("T", " ")
                      .slice(0, 16)}{" "}
                    · {Number(r.IsRead) ? "已读" : "未读"}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        <div className="math-message-pagination">
          <button
            className="btn btn-secondary"
            disabled={page === 1 || loading}
            onClick={() => setPage((v) => v - 1)}
          >
            上一页
          </button>
          <span>第 {page} 页</span>
          <button
            className="btn btn-secondary"
            disabled={rows.length < pageSize || loading}
            onClick={() => setPage((v) => v + 1)}
          >
            下一页
          </button>
        </div>
      </div>
      {current && (
        <div
          className="math-modal-backdrop"
          onClick={() => setCurrent(undefined)}
        >
          <section
            className="panel math-modal"
            role="dialog"
            aria-modal="true"
            aria-label="学习消息详情"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="math-modal-heading">
              <h3>
                {current.Title || current.Name || current.BusType || "平台通知"}
              </h3>
              <button
                className="math-text-button"
                onClick={() => setCurrent(undefined)}
              >
                关闭
              </button>
            </div>
            <RichContent
              content={
                current.Content ||
                current.Contexts ||
                current.Context ||
                current.Notes
              }
            />
            <div className="math-answer-actions">
              {target?.kind === "question" && (
                <button
                  className="btn btn-primary"
                  onClick={() => onQuestion({ QuestionID: target.id })}
                >
                  查看原题与解析
                  <ChevronRight size={15} />
                </button>
              )}
              {target?.kind === "route" && (
                <Link
                  className="btn btn-primary"
                  to={target.path}
                  onClick={() => setCurrent(undefined)}
                >
                  {target.label}
                  <ChevronRight size={15} />
                </Link>
              )}
              {target?.kind === "external" && (
                <a
                  className="btn btn-secondary"
                  href={target.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看通知原文
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
            {error && (
              <p className="math-error-text" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
