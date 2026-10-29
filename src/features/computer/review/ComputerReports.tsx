import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, RefreshCw } from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import {
  computerRequest,
  computerSubjects,
  identity,
  label,
  records,
} from "../api/computer";
import type { ComputerRecord as R } from "../api/computer";
import {
  computerLearningApi,
  normalizeComputerReport,
  reportLaunch,
} from "../practice/computer-learning";
import type { ComputerExerciseLaunch } from "../practice/computer-learning";

export function ComputerExamReport({
  data,
  majorId,
  onOpen,
  onRefresh,
}: {
  data: R;
  majorId: string;
  onOpen: (s: ComputerExerciseLaunch) => void;
  onRefresh?: () => void;
}) {
  const report = normalizeComputerReport(data),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function retry() {
    setBusy(true);
    setError("");
    try {
      if (!report.exam.id) throw new Error("当前报告没有有效的记录编号");
      await computerLearningApi.retryScore(String(report.exam.id));
      setNotice("已重新提交批阅，请稍后刷新查看结果。");
      onRefresh?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const start =
      Number(report.exam.startTime) || Date.parse(report.exam.startTime),
    end = Number(report.exam.endTime) || Date.parse(report.exam.endTime),
    seconds =
      Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? Math.round((end - start) / 1000)
        : 0;
  return (
    <div className="computer-exam-report">
      <h3>
        {report.examination.examinationName ||
          report.exam.examinationName ||
          "答题报告"}
      </h3>
      <div className="computer-report-stats">
        {[
          ["得分", report.pending ? "批阅中" : report.score],
          [
            "作答用时",
            report.exam.time ||
              `${Math.floor(seconds / 60)}分${seconds % 60}秒`,
          ],
          ["正确", report.pending ? "—" : report.correct],
          ["错误", report.pending ? "—" : report.incorrect],
          ["自查题", report.selfCheck],
          ["未答", report.unanswered],
        ].map(([title, value]) => (
          <div key={String(title)}>
            <small>{title}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {report.pending && (
        <p className="computer-notice">
          智能批阅正在处理中，完成后再显示最终得分。
        </p>
      )}
      <p className="computer-dim">自查题对照答案复盘，不计入系统正确题数。</p>
      <div className="computer-report-sheet">
        {report.answers.map((a, i) => (
          <button
            key={`${a.exerciseId}-${i}`}
            className={
              a.answerType === 1
                ? "correct"
                : a.answerType === 2
                  ? "incorrect"
                  : a.answerType === 3
                    ? "self-check"
                    : ""
            }
            onClick={() =>
              onOpen({
                ...reportLaunch(data, majorId),
                data: { ...reportLaunch(data, majorId).data, initialIndex: i },
              })
            }
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="computer-toolbar">
        <button
          className="btn btn-primary"
          disabled={!report.answers.length}
          onClick={() => onOpen(reportLaunch(data, majorId))}
        >
          全部解析
          <ArrowRight size={15} />
        </button>
        <button
          className="btn btn-secondary"
          disabled={!report.incorrect}
          onClick={() => onOpen(reportLaunch(data, majorId, true))}
        >
          只看错题
        </button>
        {report.exam.id &&
          [0, 2, 3].includes(Number(report.exam.aiScoreStatus)) && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void retry()}
            >
              重新提交AI批阅
            </button>
          )}
        {onRefresh && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCw size={15} />
            刷新报告
          </button>
        )}
      </div>
      {error && (
        <p className="computer-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="computer-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

export default function ComputerStages({
  launch,
}: {
  launch: (s: ComputerExerciseLaunch) => void;
}) {
  const [type, setType] = useState(20),
    [rows, setRows] = useState<R[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [report, setReport] = useState<R | null>(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRows([]);
    computerLearningApi
      .stages(type)
      .then((d) => {
        if (active) setRows(records(d));
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
  }, [type, version]);
  async function begin(item: R) {
    setBusy(true);
    setError("");
    try {
      const data = await computerRequest("/api/exam/wx/practice/examExercise", {
        examId: item.examId || item.id,
      });
      launch({
        data,
        title: label(item),
        majorId: item.majorId || computerSubjects[0].id,
        chapterId: String(type),
        examType: type,
        answerSource: 2,
        deriveMajor: true,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function openReport(item: R) {
    setBusy(true);
    setError("");
    try {
      setReport(
        await computerLearningApi.report(String(item.examinationRecordId)),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="computer-stages">
      <div className="tabs">
        {[
          [20, "408基础通关"],
          [21, "预备测评"],
          [22, "定校模考"],
        ].map(([id, title]) => (
          <button
            key={id}
            className={type === id ? "active" : ""}
            onClick={() => {
              setType(Number(id));
              setReport(null);
            }}
          >
            {title}
          </button>
        ))}
      </div>
      {loading && (
        <p className="computer-status" role="status">
          <LoaderCircle size={18} className="spin" />
          正在读取阶段学习进度…
        </p>
      )}
      {error && (
        <p className="computer-error" role="alert">
          {error}
          <button
            className="btn btn-secondary"
            onClick={() => setVersion((v) => v + 1)}
          >
            重新读取
          </button>
        </p>
      )}
      {!loading && !error && !rows.length && (
        <div className="empty-state">当前账号没有可用阶段测评</div>
      )}
      {report && (
        <div className="panel">
          <ComputerExamReport
            data={report}
            majorId={computerSubjects[0].id}
            onOpen={launch}
          />
          <button className="btn btn-secondary" onClick={() => setReport(null)}>
            收起报告
          </button>
        </div>
      )}
      {rows.map((item, i) => {
        const correct =
            item.correctRate == null
              ? null
              : Math.round(Number(item.correctRate) * 1000) / 10,
          pass = Number(item.passRate || 0) * 100,
          good = Number(item.goodRate || 0) * 100,
          level =
            correct == null
              ? "尚未完成"
              : !pass || !good
                ? "已完成"
                : correct < pass
                  ? "继续巩固"
                  : correct < good
                    ? "已达合格"
                    : "表现优秀";
        return (
          <article
            className="panel computer-stage-card"
            key={identity(item) || i}
          >
            <div className="computer-section-label">
              <div>
                <span className="computer-pill">
                  {computerSubjects.find((s) => s.id === item.majorId)?.name ||
                    "综合测评"}
                </span>
                <h3>{label(item)}</h3>
              </div>
              <span className="computer-pill">{level}</span>
            </div>
            <div className="computer-report-stats">
              {[
                ["题目", item.exerciseNumber ?? item.totalNumber ?? "—"],
                ["正确", item.correctNumber ?? 0],
                ["错误", item.incorrectNumber ?? 0],
                ["优秀", item.excellentNumber ?? 0],
                ["良好", item.goodNumber ?? 0],
                ["正确率", correct == null ? "—" : `${correct}%`],
              ].map(([name, value]) => (
                <div key={String(name)}>
                  <small>{name}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {correct != null && (
              <>
                <div className="computer-progress">
                  <span
                    style={{ width: `${Math.max(0, Math.min(100, correct))}%` }}
                  />
                </div>
                {pass > 0 && (
                  <p className="computer-dim">
                    合格线 {pass}% · 优秀线 {good}%
                  </p>
                )}
              </>
            )}
            {(item.startTime || item.endTime) && (
              <p className="computer-dim">
                {item.startTime || "—"} 至 {item.endTime || "—"}
              </p>
            )}
            <RichContent content={item.description || item.remark || ""} />
            <div className="computer-toolbar">
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void begin(item)}
              >
                继续测评
                <ArrowRight size={15} />
              </button>
              {item.examinationRecordId && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void openReport(item)}
                >
                  查看答题报告
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
