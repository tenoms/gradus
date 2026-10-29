import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, ThumbsUp, Trophy } from "lucide-react";
import { mathCommand, mathData, mathGet, mathPost, mathRows } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import type { MathPaperContext } from "./math-exams";
import {
  courseDistribution,
  courseQuestionAccuracy,
  courseRankingRequest,
  courseRankingVote,
  courseRankingVoteResult,
  reconcileCourseRanking,
  latestCourseExamParams,
  latestCourseScore,
} from "./course-report-more-model.mjs";
import "./course-report-more.css";

const cleanName = (value: any) =>
  value && !["null", "undefined"].includes(String(value))
    ? String(value)
    : "学习者";
export default function MathCourseReportMore({
  context,
  meta,
  questions,
}: {
  context: MathPaperContext;
  meta: MathRow;
  questions: MathRow[];
}) {
  const [opened, setOpened] = useState(false),
    [tab, setTab] = useState("ranking"),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [rows, setRows] = useState<MathRow[]>([]),
    [last, setLast] = useState<MathRow[]>([]),
    [distribution, setDistribution] = useState<MathRow>(),
    [index, setIndex] = useState(0),
    [accuracy, setAccuracy] = useState<MathRow>(),
    [limit, setLimit] = useState(100),
    [voting, setVoting] = useState<string>();
  const key = JSON.stringify(context),
    question = questions[index];
  useEffect(() => {
    if (!opened) return;
    let active = true;
    setLoading(true);
    setError("");
    const load = async () => {
      if (tab === "ranking") {
        const request = courseRankingRequest(context);
        const ownReactions = async () => {
          const reactions: MathRow[] = [];
          for (let page = 1; ; page += 1) {
            const result = await mathGet("/api/sys_give/GetListBypage", {
              StuID: context.stuid, BusType: 3, Type: 1,
              System_Station_ID: 1, limit: 1000, page,
            });
            const batch = mathRows(result);
            reactions.push(...batch);
            if (batch.length < 1000) return reactions;
          }
        };
        const [result, reactions] = await Promise.all([
          mathCommand(request.command, request.params), ownReactions(),
        ]);
        if (active) setRows(reconcileCourseRanking(mathRows(result), reactions));
      } else if (tab === "comparison") {
        const score = await mathCommand(
            "GetUserExamLastScore",
            latestCourseExamParams(context, meta, true),
          ),
          scores = mathRows(score);
        const counts = scores.length
          ? await mathCommand(
              "GetPaperExamLastByWxApp",
              latestCourseExamParams(context, meta),
            )
          : undefined;
        if (active) {
          setLast(scores);
          setDistribution(counts ? mathRows(counts)[0] : undefined);
        }
      } else if (question) {
        const result = await mathCommand("GetQuestionRightCountByPaper1", {
          QuestionID: question.QuestionID || question.ID,
        });
        if (active) setAccuracy(mathRows(result)[0]);
      }
    };
    load()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [opened, tab, key, meta.PaperNotes, meta.Use, index, version]);
  const mine = rows.findIndex((row) => String(row.StuID) === context.stuid),
    bins = courseDistribution(distribution),
    max = Math.max(1, ...bins.map((row) => row.count)),
    rate = courseQuestionAccuracy(accuracy, Number(question?.Score || 0));
  async function vote(row: MathRow) {
    setVoting(String(row.id));
    setError("");
    try {
      const request = courseRankingVote(context.stuid, row);
      const result = await mathPost(request.path, request.data);
      if (mathData(result) === false) throw new Error("平台未保存点赞状态，请刷新后重试。");
      const updated = courseRankingVoteResult(row, mathData(result));
      setRows((current) => current.map((item) =>
        String(item.id) === String(row.id) ? updated : item,
      ));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setVoting(undefined);
    }
  }
  return (
    <details
      className="mer-section mcrm"
      open={opened}
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary>
        <Trophy size={18} />
        课程成绩榜与对比
      </summary>
      {opened && (
        <>
          <div className="mcrm-tabs tabs">
            {[
              ["ranking", "课程成绩榜"],
              ["comparison", "最近模拟成绩"],
              ["accuracy", "逐题得分率"],
            ].map(([value, title]) => (
              <button
                className={tab === value ? "active" : ""}
                key={value}
                onClick={() => setTab(value)}
              >
                {title}
              </button>
            ))}
            <button
              className="icon-button"
              aria-label="刷新课程成绩对比"
              disabled={loading || !!voting}
              onClick={() => setVersion((v) => v + 1)}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          {loading && (
            <p className="mer-loading">
              <LoaderCircle className="spin" size={17} />
              正在读取当前账号的成绩统计…
            </p>
          )}
          {error && (
            <p className="mer-error" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && tab === "ranking" && (
            <>
              {mine >= 0 && (
                <p className="mcrm-own">
                  我的成绩 <strong>{rows[mine].BusValue ?? "—"} 分</strong> · 第{" "}
                  {mine + 1} 名
                </p>
              )}
              {!rows.length ? (
                <p className="mer-muted">当前课程尚无已公布的成绩榜。</p>
              ) : (
                <>
                  <ol className="mcrm-ranking">
                    {rows.slice(0, limit).map((row, i) => (
                      <li
                        className={
                          String(row.StuID) === context.stuid ? "mine" : ""
                        }
                        key={`${row.id || row.StuID}-${i}`}
                      >
                        <span className="mcrm-rank">{i + 1}</span>
                        {/^https?:\/\//i.test(row.HeadImgurl || "") ? (
                          <img src={row.HeadImgurl} alt="" loading="lazy" />
                        ) : (
                          <span className="mcrm-avatar">
                            {cleanName(row.Nickname).slice(0, 1)}
                          </span>
                        )}
                        <span className="mcrm-name">
                          {cleanName(row.Nickname || row.UserName)}
                          {String(row.StuID) === context.stuid && (
                            <small> 我</small>
                          )}
                        </span>
                        <strong>{row.BusValue ?? "—"} 分</strong>
                        <button
                          className={row.GiveState ? "liked" : ""}
                          disabled={!!voting || !row.id}
                          aria-label={`${row.GiveState ? "取消点赞" : "点赞"}${cleanName(row.Nickname)}`}
                          aria-pressed={!!row.GiveState}
                          onClick={() => void vote(row)}
                        >
                          {voting === String(row.id) ? (
                            <LoaderCircle className="spin" size={14} />
                          ) : (
                            <ThumbsUp size={14} />
                          )}{" "}
                          {Number(row.GiveCount) || 0}
                        </button>
                      </li>
                    ))}
                  </ol>
                  {rows.length > limit && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setLimit((v) => v + 100)}
                    >
                      加载更多成绩
                    </button>
                  )}
                </>
              )}
            </>
          )}
          {!loading && !error && tab === "comparison" && (
            <>
              {!last.length ? (
                <p className="mer-muted">当前账号尚无对应的最近模拟成绩。</p>
              ) : (
                <>
                  <div className="mcrm-last">
                    {last.map((row, i) => (
                      <div key={row.ID || i}>
                        <small>
                          {row.Use || meta.Use || ""} 年 ·{" "}
                          {row.Name || row.PaperName || "最近模拟卷"}
                        </small>
                        <strong>
                          {latestCourseScore(row) ?? "—"}
                          <span> 分</span>
                        </strong>
                      </div>
                    ))}
                  </div>
                  {bins.length > 0 && (
                    <>
                      <h4>对应模拟试卷分数分布</h4>
                      <div className="mcrm-bins">
                        {bins.map((row) => (
                          <div key={row.label}>
                            <span>{row.label} 分</span>
                            <div>
                              <i
                                style={{ width: `${(row.count / max) * 100}%` }}
                              />
                            </div>
                            <strong>{row.count} 人</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {tab === "accuracy" && (
            <>
              <label className="field-label">
                查看题目
                <select
                  className="input"
                  value={index}
                  onChange={(e) => {
                    setIndex(Number(e.target.value));
                    setAccuracy(undefined);
                  }}
                >
                  {questions.map((row, i) => (
                    <option value={i} key={row.QuestionID || row.ID || i}>
                      第 {i + 1} 题 · {row.Score ?? "—"} 分
                    </option>
                  ))}
                </select>
              </label>
              {!loading && !error && (
                <div className="mcrm-accuracy">
                  <small>平台本题得分率</small>
                  <strong>{rate === null ? "暂无统计" : `${rate}%`}</strong>
                  {accuracy && <p>累计作答 {Number(accuracy.count) || 0} 次</p>}
                  <p className="mer-muted">
                    按当前账号的累计得分与题目满分计算，包含主观题的部分得分。
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </details>
  );
}
