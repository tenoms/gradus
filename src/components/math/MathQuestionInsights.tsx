import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { mathCommand, mathGet, mathPost, mathRows } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import {
  mathCapacityPayload,
  mathFrequencyRows,
} from "../../platforms/math-insights";
import "./math-question-insights.css";
export default function MathQuestionInsights({
  stuid,
  qid,
  bookId = 0,
}: {
  stuid: string;
  qid: string | number;
  bookId?: string | number;
}) {
  const [opened, setOpened] = useState(false),
    [frequencies, setFrequencies] = useState<MathRow[]>([]),
    [capacity, setCapacity] = useState<MathRow>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [crowd, setCrowd] = useState<MathRow>();
  useEffect(() => {
    if (!opened) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.allSettled([
      mathGet("/api/base/GetQuestionAnalyseByID", { ID: qid }),
      bookId
        ? mathGet("/api/question_capacity_log/GetListByPage", {
            StuID: stuid,
            QuestionID: qid,
            BookID: bookId,
          })
        : Promise.resolve({ data: [] }),
      mathCommand("GetQuestionLogInfo_rel2", { QuestionID: qid }),
    ])
      .then(results => {
        if (!active) return;
        const [stats, level, aggregate] = results.map(result => result.status === "fulfilled" ? result.value : undefined);
        setError(results.flatMap(result => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : []).join("；"));
        setFrequencies(mathFrequencyRows(mathRows(stats)[0]?.List || []));
        setCapacity(mathRows(level)[0]);
        const first = mathRows(aggregate);
        const done = Number(first.find((r) => r.Type === "题目")?.counts || 0);
        setCrowd({
          done,
          favorite: Number(first.find((r) => r.Type === "收藏")?.counts || 0),
          right: Number(mathRows(aggregate, 1)[0]?.counts || 0),
        });
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
  }, [qid, bookId, stuid, opened, version]);
  return (
    <details
      className="math-question-insights"
      open={opened}
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary>题型考情与掌握记录</summary>
      {loading ? (
        <p className="mqi-loading">
          <LoaderCircle className="spin" size={15} />
          正在读取原平台统计…
        </p>
      ) : (
        <>
          {error && <p className="math-error-text" role="alert">{error}<button className="math-text-button" onClick={() => setVersion(value => value + 1)}>重新读取</button></p>}
          {crowd && crowd.done > 0 && (
            <p className="math-muted">
              平台已练 {crowd.done} 次 · 正确 {crowd.right} 次 · 收藏{" "}
              {crowd.favorite} 次 · 正确率{" "}
              {Math.round((crowd.right / crowd.done) * 100)}%
            </p>
          )}
            <section className="mqi-capacity">
              <h4>这道题的掌握程度</h4>
              <p className="math-muted">
                记录你对这道题的掌握程度。
              </p>
              <div>
                {["不会", "吃力", "熟练"].map((name, i) => (
                  <button
                    className={
                      Number(capacity?.Level) === i + 1
                        ? "btn btn-primary"
                        : "btn btn-secondary"
                    }
                    disabled={busy}
                    key={name}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await mathPost(
                          "/api/question_capacity_log/Inner_question_capacity_log",
                          mathCapacityPayload(stuid, bookId, qid, i + 1),
                        );
                        setCapacity({ Level: i + 1 });
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {Number(capacity?.Level) === i + 1 && <Check size={14} />}{" "}
                    {name}
                  </button>
                ))}
              </div>
            </section>
          <h4>同题型历年考情</h4>
          {frequencies.length ? (
            <div className="mqi-frequencies">
              {frequencies.map((r, i) => (
                <section key={r.Type || i}>
                  <h4>{r.Type || "数学"}</h4>
                  <dl>
                    <div>
                      <dt>平均分值</dt>
                      <dd>{r.AvgScore ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>考查次数</dt>
                      <dd>{r.Count ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>最近考查</dt>
                      <dd>{r.maxYear || "—"}</dd>
                    </div>
                    <div>
                      <dt>平台预测概率</dt>
                      <dd>
                        {r.Probability != null ? `${r.Probability}%` : "—"}
                      </dd>
                    </div>
                  </dl>
                  <p className="math-muted">
                    预测概率沿用原平台统计，仅供安排复习时参考。
                  </p>
                  <details>
                    <summary>查看历年分值</summary>
                    <div className="mqi-years">
                      {r.years.map((v: MathRow, j: number) => (
                        <span key={j}>
                          {v.year}年 <strong>{v.score}分</strong>
                        </span>
                      ))}
                    </div>
                  </details>
                </section>
              ))}
            </div>
          ) : (
            <p className="math-muted">原平台暂无这道题型的历年考查统计。</p>
          )}
        </>
      )}
    </details>
  );
}
