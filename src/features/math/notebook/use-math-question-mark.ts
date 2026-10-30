import { useEffect, useState } from "react";
import { mathApi, mathData, mathRows } from "../api/math";
import "./math-question-mark.css";

export interface MathQuestionMarkControl {
  active: boolean;
  busy?: boolean;
  toggle: () => void;
}

export function useMathQuestionMark(stuid: string, qid: string | number, kind: "收藏" | "错题", enabled = true) {
  const key = JSON.stringify([stuid, String(qid), kind]);
  const removeLabel = kind === "错题" ? "移出错题本" : "取消收藏";
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key: "", active: false, loading: true, error: "", removing: false, removeError: "" });
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState({ key, active: false, loading: true, error: "", removing: false, removeError: "" });
    mathApi.questionNotes(stuid, kind, qid)
      .then(response => {
        if (current) setState({ key, active: mathRows(response).length > 0, loading: false, error: "", removing: false, removeError: "" });
      })
      .catch(error => {
        if (current) setState({ key, active: false, loading: false, error: error.message || `${kind}状态读取失败`, removing: false, removeError: "" });
      });
    return () => { current = false; };
  }, [key, enabled, version]);
  const remove = async () => {
    if (!enabled || state.key !== key || !state.active || state.loading || state.removing) return;
    setState(current => ({ ...current, removing: true, removeError: "" }));
    try {
      const notes = mathRows(await mathApi.questionNotes(stuid, kind, qid));
      for (const note of notes) {
        const response = await mathApi.deleteNote(note.ID, stuid);
        if (mathData(response) === false) throw new Error(`${removeLabel}未成功，请重试`);
      }
      setState(current => current.key === key ? { ...current, active: false, removing: false } : current);
    } catch (error) {
      setState(current => current.key === key ? {
        ...current, removing: false, removeError: error instanceof Error ? error.message : `${removeLabel}失败，请重试`,
      } : current);
    }
  };
  return {
    active: state.key === key && state.active,
    loading: enabled && (state.key !== key || state.loading || state.removing),
    removing: state.key === key && state.removing,
    error: state.key === key ? state.error : "",
    removeError: state.key === key ? state.removeError : "",
    remove,
    reload: () => setVersion(value => value + 1),
    saved: () => setState({ key, active: true, loading: false, error: "", removing: false, removeError: "" }),
  };
}
