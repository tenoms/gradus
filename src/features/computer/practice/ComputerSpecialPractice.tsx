import { WorkspaceBar, WorkspaceTabs } from "../../../shared/ui/workspace-bar/WorkspaceBar";
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
import { ComputerResetDialog, ComputerResetNotice, ComputerResetToolbar, useComputerRecordReset } from "./ComputerRecordReset";

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
    [version, setVersion] = useState(0);
  const reset = useComputerRecordReset({
    scope: `${kind}:${major}`,
    records: kind.startsWith("interview") ? rows.map(item => ({ id: String(item.examinationRecordId || ""), title: label(item), answered: Number(item.correctNumber || 0) + Number(item.incorrectNumber || 0) })) : [],
    refresh: async () => {
      setRows(records(await computerLearningApi.specialList(kind, major)).sort((a, b) => Number(a.examSort || 0) - Number(b.examSort || 0)));
      setError("");
    },
  });
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
      <WorkspaceBar label="简答与复试导航" navigation={
        <WorkspaceTabs
          label="简答与复试类型"
          value={kind}
          onChange={setKind}
          items={[
            { value: "short", label: "简答专项", disabled: reset.busy },
            { value: "interview-general", label: "复试综合问答", disabled: reset.busy },
            { value: "interview-subject", label: "复试专业问答", disabled: reset.busy },
            { value: "hot", label: "错误率 Top20", disabled: reset.busy },
          ]}
        />
      }>
      {kind === "short" && (
        <select
          className="input computer-select"
          aria-label="选择简答科目"
          value={major}
          disabled={reset.busy}
          onChange={(e) => setMajor(e.target.value)}
        >
          {computerSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      </WorkspaceBar>
      <div className="panel">
        {loading && (
          <p className="computer-status" role="status">
            <LoaderCircle size={18} className="spin" />
            正在读取专项练习…
          </p>
        )}
        <ComputerResetNotice reset={reset} />
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
              集中复习高频错题，巩固容易出错的考点。
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
        <ComputerResetToolbar reset={reset} disabled={loading || busy || !!error} />
        {!loading &&
          rows.map((item, i) => (
            <div className={`computer-list-row ${reset.selecting && reset.selected.includes(String(item.examinationRecordId)) ? "computer-reset-selected" : ""}`} key={identity(item) || i}>
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
              {reset.selecting && kind !== "short" && item.examinationRecordId && (
                <label className="computer-reset-choice">
                  <input
                    type="checkbox"
                    aria-label={`选择重置${label(item)}`}
                    checked={reset.selected.includes(
                      String(item.examinationRecordId),
                    )}
                    disabled={reset.busy || loading}
                    onChange={() => reset.toggle(String(item.examinationRecordId))}
                  />
                  选择此组
                </label>
              )}
              <button
                className="btn btn-primary"
                disabled={busy || reset.busy || reset.selecting}
                onClick={() => void begin(item)}
              >
                {kind === "short" ? "开始练习" : "录音作答"}
                <ArrowRight size={15} />
              </button>
            </div>
          ))}
        <ComputerResetDialog reset={reset} />
      </div>
    </div>
  );
}
