import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { computerSubjects, records } from "../api/computer";
import type { ComputerRecord as R } from "../api/computer";
import {
  computerLearningApi,
  computerSubjectGroups,
  computerSubjectKey,
  normalizeComputerSubjects,
} from "./computer-learning";

export function useComputerSubjects() {
  const [subjects, setSubjects] = useState<R[]>(computerSubjects),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    computerLearningApi
      .subjects()
      .then((data) => {
        const rows = normalizeComputerSubjects(data);
        if (active) setSubjects(rows.length ? rows : computerSubjects);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [version]);
  return { subjects, reload: () => setVersion((v) => v + 1) };
}
export function ComputerSubjectPicker({
  value,
  onChange,
  subjects,
}: {
  value: R;
  onChange: (s: R) => void;
  subjects: R[];
}) {
  return (
    <select
      className="input computer-select"
      aria-label="选择学习科目与类别"
      value={computerSubjectKey(value)}
      onChange={(e) => {
        const next = subjects.find(
          (s) => computerSubjectKey(s) === e.target.value,
        );
        if (next) onChange(next);
      }}
    >
      {subjects.map((s) => (
        <option key={computerSubjectKey(s)} value={computerSubjectKey(s)}>
          {s.name}
          {Number(s.examCategory) === 2 ? " · 期末" : ""}
        </option>
      ))}
    </select>
  );
}
export default function ComputerSubjects({
  onUpdated,
}: {
  onUpdated?: () => void;
}) {
  const [selected, setSelected] = useState<R[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    computerLearningApi
      .subjects()
      .then((data) => {
        if (active) setSelected(normalizeComputerSubjects(data));
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
  }, []);
  async function toggle(subject: R) {
    const key = computerSubjectKey(subject),
      remove = selected.some((s) => computerSubjectKey(s) === key);
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await computerLearningApi.updateSubject(subject, remove);
      setSelected((a) =>
        remove
          ? a.filter((s) => computerSubjectKey(s) !== key)
          : [...a, subject],
      );
      setNotice(remove ? "已从自选科目移除" : "已加入自选科目");
      onUpdated?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="computer-subject-manager">
      <h3>管理自选科目</h3>
      <p className="computer-dim">
        考研与期末练习分别保存，学习入口会同步所选科目。
      </p>
      {loading && (
        <p role="status">
          <LoaderCircle className="spin" size={16} />
          正在读取自选科目…
        </p>
      )}
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
      {computerSubjectGroups.map((group) => (
        <section key={group.name}>
          <h4>{group.name}</h4>
          <div className="computer-subject-grid">
            {group.children.map((subject) => {
              const key = computerSubjectKey(subject),
                chosen = selected.some((s) => computerSubjectKey(s) === key);
              return (
                <button
                  key={key}
                  disabled={loading || !!busy}
                  className={`btn ${chosen ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => void toggle(subject)}
                >
                  {chosen && <Check size={15} />} {subject.name}
                  {busy === key && <LoaderCircle size={15} className="spin" />}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {selected
        .filter(
          (s) =>
            !computerSubjectGroups
              .flatMap((g) => g.children)
              .some((v) => computerSubjectKey(v) === computerSubjectKey(s)),
        )
        .map((s) => (
          <div className="computer-list-row" key={computerSubjectKey(s)}>
            <span>{s.name}</span>
            <button
              className="btn btn-secondary"
              onClick={() => void toggle(s)}
            >
              移出自选
            </button>
          </div>
        ))}
    </div>
  );
}
