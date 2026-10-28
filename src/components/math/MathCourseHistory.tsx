import { useEffect, useState } from "react";
import { BarChart3, LoaderCircle, RefreshCw } from "lucide-react";
import { mathRows } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import { courseApi } from "./math-courses";
export default function MathCourseHistory({
  stuid,
  CourseID,
  busType,
}: {
  stuid: string;
  CourseID: string | number;
  busType?: number;
}) {
  const [kind, setKind] = useState(busType || 1),
    [rows, setRows] = useState<MathRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    courseApi
      .history(stuid, CourseID, kind)
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
  }, [stuid, CourseID, kind, version]);
  const highest = Math.max(1, ...rows.map((r) => Number(r.BusValue) || 0));
  return (
    <section className="mc-history">
      <div className="mc-heading">
        <h3>
          <BarChart3 size={18} />
          历次课程成绩
        </h3>
        <button
          className="math-icon-button"
          disabled={loading}
          aria-label="刷新课程历史成绩"
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {!busType && (
        <div className="math-account-subtabs">
          {[
            [1, "入门摸底考"],
            [3, "出门进步考"],
          ].map(([value, text]) => (
            <button
              className={kind === value ? "active" : ""}
              key={value}
              onClick={() => setKind(Number(value))}
            >
              {text}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <p className="mc-status">
          <LoaderCircle size={18} className="spin" />
          正在读取历史成绩…
        </p>
      ) : error ? (
        <p className="mc-error" role="alert">
          {error}
        </p>
      ) : !rows.length ? (
        <p className="mc-status">暂无此类历史成绩</p>
      ) : (
        <div className="mc-history-table">
          <table>
            <thead>
              <tr>
                <th>试卷</th>
                <th>得分</th>
                <th>排名</th>
                <th>学习人数</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.ID || index}>
                  <td>
                    <span>{row.Name || "课程测评"}</span>
                    <div className="mc-score-track">
                      <i
                        style={{
                          width: `${Math.max(0, Math.min(100, (Number(row.BusValue || 0) / highest) * 100))}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td>{row.BusValue ?? "—"}</td>
                  <td>{row.ranking ?? "—"}</td>
                  <td>{row.counts ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
