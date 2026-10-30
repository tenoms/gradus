import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, LoaderCircle } from "lucide-react";
import MathQuestionReader from "../questions/MathQuestionReader";
import { answerProgress } from "../../learning/workbench/answer-progress.mjs";
import "../../learning/workbench/answer-progress.css";
import { mathData, mathGet, mathRows } from "../api/math";
import type { MathRow } from "../api/math";
import { courseApi } from "../courses/math-courses";
import {
  schoolAllAnswered,
  schoolCompletionRecord,
  schoolQuestionRecord,
} from "./school-course-model.mjs";

interface Props {
  stuid: string;
  PaperID: string | number;
  CourseID: string | number;
  CalendarID: string | number;
  ProductID: string | number;
  initialQuestionID?: string | number;
  onClose?: () => void;
  onCompleted?: () => void;
}
export default function MathSchoolCoursePractice(props: Props) {
  const {
    stuid,
    PaperID,
    CourseID,
    CalendarID,
    ProductID,
    initialQuestionID,
    onClose,
    onCompleted,
  } = props;
  const [rows, setRows] = useState<MathRow[]>([]),
    [paper, setPaper] = useState<MathRow>({}),
    [index, setIndex] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0),
    [viewed, setViewed] = useState(false),
    [completed, setCompleted] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRows([]);
    setCompleted(false);
    Promise.all([
      mathGet("/api/c_paper/GetListByAll", { ID: PaperID }),
      mathGet("/api/c_paper_question/GetListByPaper2", {
        PaperID,
        StuID: stuid,
        CalendarID,
        ProductID,
      }),
    ])
      .then(([info, list]) => {
        if (!active) return;
        const questions = mathRows(list);
        setPaper(mathRows(info)[0] || {});
        setRows(questions);
        setIndex(
          Math.max(
            0,
            questions.findIndex(
              (q) => String(q.QuestionID) === String(initialQuestionID),
            ),
          ),
        );
        setViewed(false);
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
  }, [stuid, PaperID, CalendarID, ProductID, initialQuestionID, version]);
  const context = { stuid, PaperID, CourseID, CalendarID, ProductID },
    row = rows[index],
    answered = rows.filter(
      (q) => Number(q._c_course_users_record?.ID) > 0,
    ).length;
  async function finish() {
    await courseApi.saveRecord(schoolCompletionRecord(context));
    setCompleted(true);
    setNotice("本组训练已完成，学习记录已保存。");
    onCompleted?.();
  }
  async function save(
    answer: string,
    correct: boolean,
    details?: { options: MathRow[] },
  ) {
    if (!row || Number(row._c_course_users_record?.ID) > 0) return;
    if (!details?.options.length && !viewed)
      throw new Error("请先查看解析，再反馈本题的正误。");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = schoolQuestionRecord(
          row,
          context,
          answer,
          correct,
          !!details?.options.length,
        ),
        result = await courseApi.saveRecord(payload);
      const id = Number(mathData(result));
      if (!(id > 0))
        throw new Error("尚未确认本题作答已保存，请刷新训练进度后核对。");
      const next = rows.map((q, i) =>
        i === index
          ? { ...q, _c_course_users_record: { ...payload, ID: id } }
          : q,
      );
      setRows(next);
      setNotice("本题作答已保存。");
      if (schoolAllAnswered(next)) await finish();
    } finally {
      setBusy(false);
    }
  }
  function move(to: number) {
    if (busy) return;
    setIndex(to);
    setViewed(false);
    setNotice("");
    setError("");
  }
  return (
    <div className="math-workspace">
      {onClose && (
        <button className="math-back" onClick={onClose} disabled={busy}>
          <ArrowLeft size={16} />
          返回课程任务
        </button>
      )}
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">FOCUSED PRACTICE</span>
          <h2>{paper.Name || "院校针对性训练"}</h2>
          <p>逐题练习并对照解析，保留原课程的作答与掌握记录。</p>
        </div>
        <span className="math-tag">
          已答 {answered} / {rows.length}
        </span>
      </div>
      {loading ? (
        <div className="math-state">
          <LoaderCircle className="spin" size={25} />
          <p>正在读取训练题目…</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="btn btn-secondary"
                onClick={() => setVersion((v) => v + 1)}
              >
                重新读取
              </button>
            </div>
          )}
          {!rows.length && !error && (
            <div className="math-state">
              <BookOpen size={28} />
              <p>当前课程暂无训练题目。</p>
            </div>
          )}
          {rows.length > 0 && (
            <div
              className="panel math-answer-sheet"
              aria-label="针对性训练答题卡"
            >
              {rows.map((q, i) => {
                const record = q._c_course_users_record,
                  progress = answerProgress({ saved: Number(record?.ID) > 0, correct: Number(record?.AnswerState) === 1 ? true : Number(record?.AnswerState) === 0 ? false : undefined });
                return (
                <button
                  disabled={busy}
                  aria-label={`第 ${i + 1} 题，${progress.label}`}
                  aria-current={index === i ? "step" : undefined}
                  key={q.QuestionID || i}
                  className={`${index === i ? "active" : ""} answer-progress-${progress.state}`}
                  title={progress.label}
                  onClick={() => move(i)}
                >
                  {i + 1}
                </button>
              ); })}
            </div>
          )}
          {row && (
            <MathQuestionReader
              key={`${row.QuestionID}-${row._c_course_users_record?.ID || 0}`}
              row={{ ...row, MyAnswer: row._c_course_users_record?.Answer }}
              stuid={stuid}
              practice
              selfAssessmentOnly
              noteSource="电子书"
              isCourse={false}
              readOnly={busy || Number(row._c_course_users_record?.ID) > 0}
              prev={index > 0 ? () => move(index - 1) : undefined}
              next={index < rows.length - 1 ? () => move(index + 1) : undefined}
              onAnalysisViewed={() => setViewed(true)}
              onAnswered={save}
            />
          )}
          {notice && (
            <p className="math-account-notice" role="status">
              {notice}
            </p>
          )}
          {busy && <p className="math-footnote">正在同步训练进度…</p>}
          {schoolAllAnswered(rows) && (
            <div className="panel math-state">
              <CheckCircle2 size={28} />
              <h3>{completed ? "本组训练已完成" : "全部题目已有作答记录"}</h3>
              {!completed && (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await finish();
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  完成训练并更新课程进度
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
