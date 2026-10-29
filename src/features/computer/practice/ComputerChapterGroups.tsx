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
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [version, setVersion] = useState(0),
    rows = records(data.groupList);
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
  async function reset() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await computerLearningApi.resetRecords(selected);
      setSelected([]);
      setVersion((v) => v + 1);
      setNotice("重置请求已提交，请刷新查看学习进度。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <button className="computer-back" onClick={onClose}>
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
      {notice && (
        <p className="computer-notice" role="status">
          {notice}
        </p>
      )}
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
          <div className="computer-list-row" key={identity(group) || index}>
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
            {recordId && (
              <label className="computer-toolbar">
                <input
                  type="checkbox"
                  aria-label={`选择重置${label(group)}`}
                  checked={selected.includes(recordId)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, recordId]
                        : s.filter((id) => id !== recordId),
                    )
                  }
                />
                选择重置
              </label>
            )}
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void begin(group)}
            >
              开始练习
              <ArrowRight size={15} />
            </button>
          </div>
        );
      })}
      {rows.some((r) => r.examRecordId || r.examinationRecordId) && (
        <div className="computer-toolbar">
          <button
            className="btn btn-secondary"
            disabled={busy || !selected.length}
            onClick={() => {
              if (
                window.confirm(
                  `重置所选 ${selected.length} 组已有答题记录？此操作会清除对应练习进度。`,
                )
              )
                void reset();
            }}
          >
            重置所选学习记录
          </button>
        </div>
      )}
    </div>
  );
}
