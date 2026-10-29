import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { mathGet, mathPost, mathRows } from "../api/math";
import type { MathRow } from "../api/math";
import { recordStudy } from "../../learning/state/store";

export default function MathExtrapolation({
  stuid,
  sourceQuestionId,
  renderQuestion,
}: {
  stuid: string;
  sourceQuestionId: number | string;
  renderQuestion: (row: MathRow) => ReactNode;
}) {
  const [rows, setRows] = useState<MathRow[]>([]);
  const [current, setCurrent] = useState<MathRow>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<number>();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    mathGet("/api/quesiton_extrapolation_log/GetQuestionPush", {
      stuid,
      QuestionID: sourceQuestionId,
      limit: 10,
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
  }, [sourceQuestionId, stuid]);
  const select = (row: MathRow) => {
    setCurrent({ ...row, QuestionID: row.ID || row.QuestionID });
    setNotice("");
    setState(undefined);
  };
  const assess = async (State: number) => {
    if (!current) return;
    setBusy(true);
    setNotice("");
    try {
      const original = mathRows(
        await mathGet("/api/quesiton_extrapolation_log/GetListByPage", {
          SourceQuestionID: current.QuestionID,
          QuestionID: sourceQuestionId,
          StuID: stuid,
          page: 1,
          limit: 1,
        }),
      )[0];
      await mathPost(
        "/api/quesiton_extrapolation_log/Inner_quesiton_extrapolation_log",
        {
          ...(original?.ID
            ? { ID: original.ID, State, UpdateColumns: "ID,State" }
            : {
                StuID: stuid,
                SourceQuestionID: current.QuestionID,
                QuestionID: sourceQuestionId,
                State,
                Type: "举一反三",
              }),
        },
      );
      setState(State);
      setNotice("举一反三学习结果已保存到当前 Web 学习账号");
      recordStudy({
        platform: "math",
        type: "extrapolation",
        title: `举一反三 · 第 ${current.QuestionID} 题`,
        total: 1,
        correct: State === 1 ? 1 : 0,
        path: "/study/question-bank",
      });
    } catch (e: any) {
      setNotice(`保存失败：${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  if (current)
    return (
      <div className="math-workspace">
        <button className="math-back" onClick={() => setCurrent(undefined)}>
          <ArrowLeft size={15} />
          返回同类推荐
        </button>
        {renderQuestion(current)}
        <div className="panel mrq-extrapolation-result">
          <span>
            {state
              ? `本题已标记：${state === 1 ? "已掌握" : state === 2 ? "需要巩固" : "暂时不会做"}`
              : "对照解析，记录你对这道变式题的掌握程度"}
          </span>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => assess(1)}
          >
            <Check size={15} />
            已掌握
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => assess(2)}
          >
            需要巩固
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => assess(3)}
          >
            暂时不会做
          </button>
          {notice && (
            <p className="math-account-notice" role="status">
              {notice}
            </p>
          )}
        </div>
      </div>
    );
  return (
    <div>
      {loading ? (
        <div className="math-state">
          <LoaderCircle className="spin" size={23} />
          <p>正在匹配同类与变式题目…</p>
        </div>
      ) : error ? (
        <div className="math-state math-error">
          <p>{error}</p>
        </div>
      ) : !rows.length ? (
        <div className="math-state">
          <p>这道题暂时没有可用的同类推荐</p>
          <small>可以继续学习下一题，或到分类题库选择相同知识点。</small>
        </div>
      ) : (
        <>
          <div className="math-toolbar">
            <h3>举一反三</h3>
            <span className="math-count">{rows.length} 道同类与变式题目</span>
          </div>
          <div className="mrq-recommend-grid">
            {rows.map((r, i) => (
              <button key={r.ID || i} onClick={() => select(r)}>
                <RichContent
                  content={r.QuestionTxt || r.Name || `变式题 ${i + 1}`}
                />
                {r.QuestionImg && !r.QuestionTxt && (
                  <img
                    className="math-question-image"
                    src={r.QuestionImg}
                    alt={`变式题 ${i + 1}`}
                  />
                )}
                <span>
                  开始巩固
                  <ArrowRight size={14} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
