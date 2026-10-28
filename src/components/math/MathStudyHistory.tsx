import { useEffect, useState } from "react";
import {
  ArrowDownWideNarrow,
  BookOpen,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import RichContent from "../RichContent";
import { mathCommand, mathRows } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import {
  mathHistoryCommands,
  mathHistoryParams,
  mathHistoryQuestion,
} from "../../platforms/math-history";
import "./math-study-history.css";
type Category = keyof typeof mathHistoryCommands;
export default function MathStudyHistory({
  stuid,
  onQuestion,
}: {
  stuid: string;
  onQuestion: (row: MathRow) => void;
}) {
  const [tab, setTab] = useState<Category>("教辅");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<MathRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [level, setLevel] = useState(0);
  const [counts, setCounts] = useState<Record<number, number>>();
  const [sort, setSort] = useState("new");
  const [version, setVersion] = useState(0);
  const pageSize = 20;
  useEffect(() => {
    let active = true;
    mathCommand("GetUserCapacityCount", { StuID: stuid })
      .then((r) => {
        if (active) {
          const values: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
          for (const row of mathRows(r))
            values[Number(row.Levels)] = Number(row.count || 0);
          setCounts(values);
        }
      })
      .catch(() => {
        if (active) setCounts(undefined);
      });
    return () => {
      active = false;
    };
  }, [stuid, version]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const command =
      tab === "教辅" && level
        ? "GetUserCourseQrcodeBookListPager11"
        : mathHistoryCommands[tab];
    const params =
      level && tab === "教辅"
        ? { StuID: stuid }
        : mathHistoryParams(stuid, page, pageSize, tab);
    mathCommand(command, params)
      .then((r) => {
        if (!active) return;
        const result = mathRows(r);
        const filtered =
          level && tab === "教辅"
            ? result.filter((row) => Number(row.Levels) === level)
            : result;
        setRows((previous) =>
          page === 0 ? filtered : [...previous, ...filtered],
        );
        setMore(!level && result.length === pageSize);
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
  }, [stuid, tab, page, level, version]);
  const choose = (category: Category) => {
    setTab(category);
    setPage(0);
    setLevel(0);
    setRows([]);
    setMore(false);
  };
  const reload = () => {
    setRows([]);
    setPage(0);
    setVersion((v) => v + 1);
  };
  const sorted = [...rows].sort(
    (a, b) =>
      String(a.addTime || a.AddTime || "").localeCompare(
        String(b.addTime || b.AddTime || ""),
      ) * (sort === "new" ? -1 : 1),
  );
  return (
    <div className="math-study-history">
      <div className="tabs msh-tabs">
        {(Object.keys(mathHistoryCommands) as Category[]).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => choose(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "教辅" && (
        <div className="msh-capacity">
          {["不会", "吃力", "熟练"].map((name, i) => (
            <button
              key={name}
              className={level === i + 1 ? "active" : ""}
              onClick={() => {
                setLevel((v) => (v === i + 1 ? 0 : i + 1));
                setPage(0);
                setRows([]);
              }}
            >
              <span>{name}</span>
              <strong>{counts ? counts[i + 1] || 0 : "—"}</strong>
              <small>
                {level === i + 1 ? "点击查看全部" : "按掌握程度筛选"}
              </small>
            </button>
          ))}
        </div>
      )}
      <div className="msh-toolbar">
        <span>{rows.length} 条已加载记录</span>
        <label>
          <ArrowDownWideNarrow size={14} />
          <select
            aria-label="学习记录排序"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="new">最近学习在前</option>
            <option value="old">较早学习在前</option>
          </select>
        </label>
        <button
          className="math-icon-button"
          aria-label="刷新学习记录"
          onClick={reload}
          disabled={loading}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {error && (
        <div className="math-state math-error">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={reload}>
            重新加载
          </button>
        </div>
      )}
      <div className="msh-records">
        {sorted.map((row, i) => {
          const q = mathHistoryQuestion(row);
          return (
            <button
              key={`${q.QuestionID}-${i}`}
              disabled={!q.QuestionID}
              onClick={() => onQuestion(q)}
            >
              <div className="math-list-icon">
                <BookOpen size={18} />
              </div>
              <span>
                <strong>{q.BookName || row.Name || `${tab}学习记录`}</strong>
                <small>
                  第 {q.QuestionPage || "—"} 页 · 第{" "}
                  {q.QuestionSort || q.QuestionID || "—"} 题 ·{" "}
                  {String(row.addTime || row.AddTime || "")
                    .replace("T", " ")
                    .slice(0, 16)}
                </small>
                {row.QuestionTxt && <RichContent content={row.QuestionTxt} />}
              </span>
              <ChevronRight size={16} />
            </button>
          );
        })}
      </div>
      {loading ? (
        <div className="math-state">
          <LoaderCircle className="spin" size={23} />
          <p>正在读取原平台学习记录…</p>
        </div>
      ) : !rows.length && !error ? (
        <div className="math-state">
          <BookOpen size={27} />
          <p>当前分类暂无学习记录</p>
        </div>
      ) : more && !error ? (
        <button
          className="btn btn-secondary msh-more"
          onClick={() => setPage((v) => v + 1)}
        >
          加载更多记录
        </button>
      ) : rows.length > 0 && !error ? (
        <p className="msh-end">已显示当前分类的全部记录</p>
      ) : null}
    </div>
  );
}
