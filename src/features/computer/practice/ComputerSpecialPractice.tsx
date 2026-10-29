import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import {
  computerRequest,
  computerSubjects,
  identity,
  label,
  records,
} from "../api/computer";
import type { ComputerRecord as R } from "../api/computer";
import { computerLearningApi } from "./computer-learning";
import type { ComputerExerciseLaunch } from "./computer-learning";

export default function ComputerSpecialPractice({
  launch,
}: {
  launch: (s: ComputerExerciseLaunch) => void;
}) {
  const [kind, setKind] = useState("short"),
    [major, setMajor] = useState(computerSubjects[0].id),
    [rows, setRows] = useState<R[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    if (kind === "hot") {
      setRows([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    computerLearningApi
      .specialList(kind, major)
      .then((d) => {
        if (active)
          setRows(
            records(d).sort(
              (a, b) => Number(a.examSort || 0) - Number(b.examSort || 0),
            ),
          );
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
  }, [kind, major, version]);
  async function begin(item: R) {
    setBusy(true);
    setError("");
    try {
      const examType =
          kind === "short"
            ? 3
            : Number(item.type || (kind === "interview-general" ? 18 : 19)),
        query = {
          majorId: item.majorId || major,
          chapterId: item.chapterId,
          sectionId: item.sectionId,
          examType,
          examCategory: 1,
          number: 1,
          ...(kind === "short" ? { examExerciseType: 4 } : {}),
        },
        data = await computerRequest(
          "/api/exam/wx/practice/exerciseList",
          query,
        );
      launch({
        data,
        title: label(item),
        majorId: query.majorId,
        chapterId: query.chapterId,
        sectionId: query.sectionId,
        examType,
        examCategory: 1,
        examExerciseType: kind === "short" ? 4 : undefined,
        voice: kind !== "short",
        source: kind === "short" ? "short-answer" : "interview",
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    setError("");
    try {
      await computerLearningApi.resetRecords(selected);
      setNotice("重置请求已提交，请刷新查看进度。");
      setSelected([]);
      setVersion((v) => v + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function hot() {
    setBusy(true);
    setError("");
    try {
      const data = await computerLearningApi.hotQuestions();
      launch({
        data,
        title: "错误率Top20挑战",
        majorId: computerSubjects[0].id,
        examType: 6,
        chapterId: "5",
        answerSource: 8,
        deriveMajor: true,
        source: "hot",
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="computer-special-practice">
      <div className="tabs">
        {[
          ["short", "简答专项"],
          ["interview-general", "复试综合问答"],
          ["interview-subject", "复试专业问答"],
          ["hot", "错误率Top20"],
        ].map(([id, name]) => (
          <button
            className={kind === id ? "active" : ""}
            key={id}
            onClick={() => {
              setKind(id);
              setSelected([]);
              setNotice("");
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {kind === "short" && (
        <select
          className="input computer-select"
          aria-label="选择简答科目"
          value={major}
          onChange={(e) => setMajor(e.target.value)}
        >
          {computerSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <div className="panel">
        {loading && (
          <p className="computer-status" role="status">
            <LoaderCircle size={18} className="spin" />
            正在读取专项练习…
          </p>
        )}
        {notice && (
          <p className="computer-notice" role="status">
            {notice}
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
        {kind === "hot" && (
          <>
            <h3>错误率Top20挑战</h3>
            <p className="computer-dim">
              读取原平台的高频错题练习，集中复习容易出错的考点。
            </p>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void hot()}
            >
              开始挑战
              <ArrowRight size={15} />
            </button>
          </>
        )}
        {kind !== "hot" && !loading && !error && !rows.length && (
          <div className="empty-state">当前没有可用专项练习</div>
        )}
        {!loading &&
          rows.map((item, i) => (
            <div className="computer-list-row" key={identity(item) || i}>
              <div className="computer-grow">
                <h3>{label(item)}</h3>
                <p>
                  {item.exerciseNumber ?? item.totalNumber ?? "—"} 题 · 已答{" "}
                  {Number(item.correctNumber || 0) +
                    Number(item.incorrectNumber || 0)}{" "}
                  题
                  {item.excellentNumber != null
                    ? ` · 优秀 ${item.excellentNumber} 题`
                    : ""}
                  {item.goodNumber != null
                    ? ` · 良好 ${item.goodNumber} 题`
                    : ""}
                </p>
              </div>
              {kind !== "short" && item.examinationRecordId && (
                <label className="computer-toolbar">
                  <input
                    type="checkbox"
                    aria-label={`选择重置${label(item)}`}
                    checked={selected.includes(
                      String(item.examinationRecordId),
                    )}
                    onChange={(e) =>
                      setSelected((a) =>
                        e.target.checked
                          ? [...a, String(item.examinationRecordId)]
                          : a.filter(
                              (id) => id !== String(item.examinationRecordId),
                            ),
                      )
                    }
                  />
                  选择重置
                </label>
              )}
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void begin(item)}
              >
                {kind === "short" ? "开始练习" : "录音作答"}
                <ArrowRight size={15} />
              </button>
            </div>
          ))}
        {kind.startsWith("interview") &&
          rows.some((r) => r.examinationRecordId) && (
            <button
              className="btn btn-secondary"
              disabled={busy || !selected.length}
              onClick={() => {
                if (
                  window.confirm(
                    `重置所选 ${selected.length} 组复试已有答题记录？此操作会清除对应练习进度。`,
                  )
                )
                  void reset();
              }}
            >
              重置所选复试记录
            </button>
          )}
      </div>
    </div>
  );
}
