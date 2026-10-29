import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FileText,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { mathFreshCommand as mathCommand, mathRows } from "../api/math";
import type { MathRow } from "../api/math";
import "./math-qa-report.css";
import { qaReportDetailParams } from "./math-qa";
type Detail = {
  type: "book" | "month" | "chapter";
  id?: number | string;
  name: string;
};
export default function MathQAReport({
  stuid,
  back,
  onOrder,
  onQuestion,
}: {
  stuid: string;
  back: () => void;
  onOrder: (row: MathRow) => void;
  onQuestion?: (row: MathRow) => void;
}) {
  const [data, setData] = useState<{
    user: MathRow;
    books: MathRow[];
    months: MathRow[];
    chapters: MathRow[];
  }>({ user: {}, books: [], months: [], chapters: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState("全部");
  const [detail, setDetail] = useState<Detail>();
  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await Promise.all(
        [
          "getUserQAInfo",
          "getUserQABookList",
          "getUserQAMonthList",
          "getUserQAChaperList",
        ].map((command) =>
          mathCommand(command, { StuID: stuid }),
        ),
      );
      setData({
        user: mathRows(result[0])[0] || {},
        books: mathRows(result[1]),
        months: mathRows(result[2]),
        chapters: mathRows(result[3]),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, [stuid]);
  if (detail)
    return (
      <ReportDetail
        detail={detail}
        stuid={stuid}
        back={() => setDetail(undefined)}
        onOrder={onOrder}
        onQuestion={onQuestion}
      />
    );
  const bookTotal = data.books.reduce(
    (sum, r) => sum + Number(r.BCounts || 0),
    0,
  );
  const months = data.months.filter(
    (r) => year === "全部" || String(r.Months).startsWith(year),
  );
  const max = Math.max(1, ...months.map((r) => Number(r.Counts || 0)));
  const years = [
    ...new Set(
      data.months
        .map((r) => String(r.Months || "").split("-")[0])
        .filter(Boolean),
    ),
  ]
    .sort()
    .reverse();
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回学习答疑
      </button>
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">QUESTIONS & GROWTH</span>
          <h2>看见你的思考轨迹</h2>
          <p>按月份、书籍与章节查看数学答疑，找到值得继续巩固的知识点。</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={reload}
          disabled={loading}
        >
          <RefreshCw size={15} />
          刷新统计
        </button>
      </div>
      {loading ? (
        <div className="panel math-state">
          <LoaderCircle className="spin" size={24} />
          <p>正在读取你的答疑报告…</p>
        </div>
      ) : error ? (
        <div className="panel math-state math-error">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={reload}>
            重新加载
          </button>
        </div>
      ) : (
        <>
          <div className="mqr-summary">
            <div className="panel">
              <MessageSquare size={22} />
              <span>累计发起答疑</span>
              <strong>
                {data.user.QaCounts ?? 0}
                <small>次</small>
              </strong>
            </div>
            <div className="panel">
              <BookOpen size={22} />
              <span>涉及书籍</span>
              <strong>
                {data.books.length}
                <small>本</small>
              </strong>
            </div>
            <div className="panel">
              <FileText size={22} />
              <span>涉及章节</span>
              <strong>
                {data.chapters.length}
                <small>个</small>
              </strong>
            </div>
          </div>
          <div className="mqr-grid">
            <section className="panel">
              <div className="math-toolbar">
                <h3>按书籍分布</h3>
                <span className="math-count">累计 {bookTotal} 次</span>
              </div>
              <div className="mqr-book-distribution">
                {data.books.map((r, i) => (
                  <button
                    key={r.ID || i}
                    onClick={() =>
                      setDetail({
                        type: "book",
                        id: r.ID,
                        name: r.Name || "数学书籍",
                      })
                    }
                  >
                    <div>
                      <strong>{r.Name || "数学书籍"}</strong>
                      <span>
                        {Number(r.BCounts || 0)} 次 ·{" "}
                        {bookTotal
                          ? Math.round(
                              (Number(r.BCounts || 0) / bookTotal) * 100,
                            )
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="mqr-progress">
                      <span
                        style={{
                          width: `${bookTotal ? (Number(r.BCounts || 0) / bookTotal) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </button>
                ))}
                {!data.books.length && (
                  <div className="math-state">
                    <p>暂无按书籍汇总的答疑记录</p>
                  </div>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="math-toolbar">
                <h3>每月提问趋势</h3>
                <select
                  className="input mqr-year"
                  aria-label="答疑统计年份"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                >
                  <option>全部</option>
                  {years.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </div>
              {months.length ? (
                <div
                  className="mqr-month-chart"
                  role="group"
                  aria-label="点击月份查看答疑明细"
                >
                  {months.map((r, i) => (
                    <button
                      key={r.Months || i}
                      onClick={() =>
                        setDetail({ type: "month", name: r.Months })
                      }
                      aria-label={`${r.Months}，${r.Counts || 0}次答疑`}
                    >
                      <span>{r.Counts || 0}</span>
                      <div
                        style={{
                          height: `${Math.max(3, (Number(r.Counts || 0) / max) * 150)}px`,
                        }}
                      />
                      <small>{String(r.Months || "").slice(2)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="math-state">
                  <p>暂无按月份汇总的答疑记录</p>
                </div>
              )}
            </section>
          </div>
          <section className="panel">
            <div className="math-toolbar">
              <h3>按章节复盘</h3>
            </div>
            <div className="math-content-list">
              {data.chapters.map((r, i) => (
                <button
                  key={r.ID || i}
                  onClick={() =>
                    setDetail({
                      type: "chapter",
                      id: r.ID,
                      name: r.Name || "数学章节",
                    })
                  }
                >
                  <div className="math-list-icon">
                    <span>{i + 1}</span>
                  </div>
                  <span>
                    <strong>{r.Name || "数学章节"}</strong>
                    <small>{r.Counts || 0} 次答疑</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
              {!data.chapters.length && (
                <div className="math-state">
                  <p>暂无章节答疑记录</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
function ReportDetail({
  detail,
  stuid,
  back,
  onOrder,
  onQuestion,
}: {
  detail: Detail;
  stuid: string;
  back: () => void;
  onOrder: (row: MathRow) => void;
  onQuestion?: (row: MathRow) => void;
}) {
  const [rows, setRows] = useState<MathRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const command =
      detail.type === "book"
        ? "getUserQADetailListByBookID"
        : detail.type === "chapter"
          ? "getUserQADetailListByChapter"
          : "getUserQADetailListByMonth";
    const params = qaReportDetailParams(
      stuid,
      detail.type,
      detail.id,
      detail.name,
    );
    mathCommand(command, params)
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
  }, [detail.type, detail.id, detail.name, stuid]);
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回答疑统计
      </button>
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">QUESTION DETAILS</span>
          <h2>{detail.name}</h2>
          <p>共 {rows.length} 条答疑记录，点击记录查看原解答。</p>
        </div>
      </div>
      <div className="panel mqr-details">
        {loading ? (
          <div className="math-state">
            <LoaderCircle className="spin" size={23} />
          </div>
        ) : error ? (
          <div className="math-state math-error">
            <p>{error}</p>
          </div>
        ) : !rows.length ? (
          <div className="math-state">
            <p>当前分类暂无答疑记录</p>
          </div>
        ) : (
          rows.map((r, i) => (
            <article key={r.OrderID || r.QID || i}>
              <div className="mqr-detail-header">
                <span className="math-tag">{r.StateName || "学习答疑"}</span>
                <time>
                  {String(r.AddTime || "")
                    .replace("T", " ")
                    .slice(0, 16)}
                </time>
              </div>
              <h3>
                第 {r.QuestionPage || "—"} 页 · 第{" "}
                {r.QuestionSort || r.QuestionID || i + 1} 题
              </h3>
              <RichContent content={r.Title} />
              <p>
                {r.Name || ""} {r.BookYear || ""}{" "}
                {r.BookType || r.BusValue || ""}
              </p>
              <div className="mqr-detail-images">
                {(Array.isArray(r.Files)
                  ? r.Files
                  : typeof r.Files === "string"
                    ? r.Files.split(",")
                    : []
                )
                  .filter((url: string) => /^https?:/.test(url))
                  .map((url: string, j: number) => (
                    <a href={url} key={j} target="_blank" rel="noreferrer">
                      <img src={url} alt={`答疑图片${j + 1}`} />
                    </a>
                  ))}
              </div>
              <div className="mqr-detail-actions">
                <button
                  className="btn btn-primary"
                  disabled={!r.OrderID}
                  onClick={() =>
                    onOrder({
                      ...r,
                      ID: r.OrderID,
                      QuestionID: r.QID || r.QuestionID,
                    })
                  }
                >
                  查看答疑解答
                  <ChevronRight size={15} />
                </button>
                {onQuestion && (
                  <button
                    className="btn btn-secondary"
                    disabled={!(r.QID || r.QuestionID)}
                    onClick={() =>
                      onQuestion({ ...r, QuestionID: r.QID || r.QuestionID })
                    }
                  >
                    查看原题解析
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
