import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import {
  computerRequest,
  identity,
  label,
  records,
} from "../api/computer";
import type { ComputerRecord as R } from "../api/computer";
import { computerLearningApi, computerPracticeType } from "./computer-learning";
import type { ComputerExerciseLaunch } from "./computer-learning";
import { ComputerResetDialog, ComputerResetNotice, ComputerResetToolbar, useComputerRecordReset } from "./ComputerRecordReset";

export default function ComputerChapterGroups({
  chapter,
  subject,
  onClose,
  launch,
}: {
  chapter: R;
  subject: R;
  onClose: () => void;
  launch: (s: ComputerExerciseLaunch) => void;
}) {
  const [data, setData] = useState<R>({}),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    rows = records(data.groupList);
  const reset = useComputerRecordReset({
    scope: identity(chapter),
    records: rows.map(group => ({ id: String(group.examRecordId || group.examinationRecordId || ""), title: label(group), answered: Number(group.correctNumber || 0) + Number(group.incorrectNumber || 0) })),
    refresh: async () => {
      setData(await computerLearningApi.groups(identity(chapter)) || {});
      setError("");
    },
  });
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    computerLearningApi
      .groups(identity(chapter))
      .then((d) => {
        if (active) setData(d || {});
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
  }, [chapter.id, version]);
  async function begin(group: R) {
    setBusy(true);
    setError("");
    try {
      const examGroupId = identity(group);
      const query = {
          majorId: String(subject.id),
          chapterId: identity(chapter),
          examGroupId,
          examExerciseType: 1,
          examType: computerPracticeType(Number(subject.examCategory || 1)),
          examCategory: Number(subject.examCategory || 1),
          number: 1,
        },
        data = await computerLearningApi.groupExercise(
          subject,
          query.chapterId,
          examGroupId,
        );
      launch({ data, title: label(group), ...query });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <button className="computer-back" disabled={reset.busy} onClick={onClose}>
        <ArrowLeft size={15} />
        返回章节
      </button>
      <h2>{label(chapter)} · 分组练习</h2>
      <p className="computer-dim">
        按原练习组继续学习，每一组分别保存答题进度。
      </p>
      {loading && (
        <p className="computer-status" role="status">
          <LoaderCircle className="spin" size={18} />
          正在读取练习分组…
        </p>
      )}
      {error && (
        <p className="computer-error" role="alert">
          {error}
          <button
            className="btn btn-secondary"
            onClick={() => setVersion((v) => v + 1)}
          >
            重试
          </button>
        </p>
      )}
      <ComputerResetNotice reset={reset} />
      <ComputerResetToolbar reset={reset} disabled={loading || busy || !!error} />
      {!loading && !error && !rows.length && (
        <div className="empty-state">该章节暂时没有可用练习组</div>
      )}
      {rows.map((group, index) => {
        const count =
            Number(group.correctNumber || 0) +
            Number(group.incorrectNumber || 0),
          recordId = String(
            group.examRecordId || group.examinationRecordId || "",
          ),
          active = String(data.lastExaminationGroupId) === identity(group);
        return (
          <div className={`computer-list-row ${reset.selecting && reset.selected.includes(recordId) ? "computer-reset-selected" : ""}`} key={identity(group) || index}>
            <div className="computer-grow">
              <span className="computer-pill">
                {active
                  ? "正在学习"
                  : count && count === Number(group.totalNumber)
                    ? "已完成"
                    : count
                      ? "继续学习"
                      : "待学习"}
              </span>
              <h3>{label(group)}</h3>
              <p>
                {group.totalNumber ?? group.exerciseNumber ?? "—"} 题 · 已答{" "}
                {count} 题 · 正确 {group.correctNumber || 0} 题
                {count
                  ? ` · 错误率 ${Math.round((Number(group.incorrectNumber || 0) / count) * 100)}%`
                  : ""}
              </p>
            </div>
            {reset.selecting && recordId && (
              <label className="computer-reset-choice">
                <input
                  type="checkbox"
                  aria-label={`选择重置${label(group)}`}
                  checked={reset.selected.includes(recordId)}
                  disabled={reset.busy || loading}
                  onChange={() => reset.toggle(recordId)}
                />
                选择此组
              </label>
            )}
            <button
              className="btn btn-primary"
              disabled={busy || reset.busy || reset.selecting}
              onClick={() => void begin(group)}
            >
              开始练习
              <ArrowRight size={15} />
            </button>
          </div>
        );
      })}
      <ComputerResetDialog reset={reset} />
    </div>
  );
}
