import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, RefreshCw } from "lucide-react";
import MathQuestionReader from "./MathQuestionReader";
import { mathRows } from "../../platforms/math";
import { recordActivity } from "../../lib/store";
import { teacherRecommendationApi } from "./math-course-recommendations";
import type {
  RecommendationContext,
  RecommendationRow as R,
} from "./math-course-recommendations";
import { teacherRecommendationRecord } from "./course-recommendations-model.mjs";
import "./math-course-recommendations.css";

export default function MathTeacherRecommendations({
  stuid,
  QuestionID,
  PaperID,
  CourseID,
  CalendarID,
  ProductID,
  onClose,
}: {
  stuid: string;
  QuestionID: string | number;
  PaperID: string | number;
  CourseID: string | number;
  CalendarID: string | number;
  ProductID: string | number;
  onClose?: () => void;
}) {
  const context: RecommendationContext = {
      stuid,
      PaperID,
      CourseID,
      CalendarID,
      ProductID,
    },
    [rows, setRows] = useState<R[]>([]),
    [index, setIndex] = useState(0),
    [record, setRecord] = useState<R>({}),
    [loading, setLoading] = useState(true),
    [reading, setReading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0),
    question = rows[index],
    qid = question?.QuestionID,
    started = useRef(Date.now());
  useEffect(() => {
    let active = true;
    setRows([]);
    setIndex(0);
    setLoading(true);
    setError("");
    teacherRecommendationApi
      .load(QuestionID)
      .then((data) => {
        if (active) setRows(data.questions);
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
  }, [QuestionID, version]);
  useEffect(() => {
    if (!qid) return;
    let active = true;
    setReading(true);
    setRecord({});
    setError("");
    setNotice("");
    started.current = Date.now();
    teacherRecommendationApi
      .record(context, qid)
      .then((response) => {
        if (active) setRecord(mathRows(response)[0] || {});
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setReading(false);
      });
    return () => {
      active = false;
    };
  }, [qid, stuid, PaperID, CourseID, CalendarID, ProductID]);
  async function save(correct: number) {
    if (!question || reading || Number(record.ID) > 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = teacherRecommendationRecord(
          context,
          question,
          record,
          correct,
        ),
        saved = await teacherRecommendationApi.save(payload);
      if (Number(saved.ID) > 0) setRecord(saved);
      else
        setRecord(
          mathRows(await teacherRecommendationApi.record(context, qid))[0] ||
            {},
        );
      recordActivity({
        platform: "math",
        type: "teacher-practice",
        title: question._question_list?.FocalLinkName || "老师推题训练",
        total: 1,
        correct: correct === 1 ? 1 : 0,
        durationSeconds: Math.max(
          0,
          Math.round((Date.now() - started.current) / 1000),
        ),
        path: "/study/courses",
      });
      setNotice("练习反馈已保存到本次课程测评。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="math-course-recommendations">
      <section className="panel mcr-heading">
        <div>
          {onClose && (
            <button className="mcr-back" onClick={onClose}>
              <ArrowLeft size={15} />
              返回阅卷试卷
            </button>
          )}
          <span className="mcr-eyebrow">TEACHER PRACTICE</span>
          <h2>老师推题训练</h2>
          <p>围绕本题的原推荐分组，纸上作答后查看解析并反馈正误。</p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={loading || busy}
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={15} />
          刷新题组
        </button>
      </section>
      {loading && (
        <p className="mcr-status" role="status">
          <LoaderCircle className="spin" size={18} />
          正在读取老师推荐题组…
        </p>
      )}
      {error && (
        <p className="mcr-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mcr-notice" role="status">
          {notice}
        </p>
      )}
      {!loading && !error && !rows.length && (
        <div className="panel empty-state">
          <h3>这道题暂无老师推荐的同组练习</h3>
          <p>返回原卷继续其他题目。</p>
        </div>
      )}
      {question && (
        <section className="panel mcr-work">
          <div className="mcr-work-top">
            <strong>
              {question._question_list?.FocalLinkName ||
                question._question_list?.ChapterName ||
                "同组练习"}
            </strong>
            <span className="mcr-pill">
              第 {index + 1} / {rows.length} 题
            </span>
            {Number(record.ID) > 0 && (
              <span className="mcr-saved">
                <Check size={14} />
                {Number(record.AnswerState) === 1
                  ? "已反馈正确"
                  : "已反馈需巩固"}
              </span>
            )}
          </div>
          <MathQuestionReader
            key={`teacher-recommend-${qid}`}
            row={{ ...question, Source: "课程" }}
            stuid={stuid}
            readOnly
            practice
            selfAssessmentOnly
            noteSource="课程"
            isCourse={false}
            prev={index > 0 ? () => setIndex(index - 1) : undefined}
            next={
              index + 1 < rows.length ? () => setIndex(index + 1) : undefined
            }
          />
          <div className="mcr-actions">
            <button
              className="btn btn-primary"
              disabled={busy || reading || Number(record.ID) > 0}
              onClick={() => void save(1)}
            >
              我答对了
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy || reading || Number(record.ID) > 0}
              onClick={() => void save(0)}
            >
              我答错了
            </button>
            {reading && (
              <span className="mcr-muted">正在恢复这道题的练习反馈…</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
