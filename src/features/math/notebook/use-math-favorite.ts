import { useEffect, useState } from "react";
import { mathApi, mathData, mathRows } from "../api/math";
import "./math-favorite.css";

export interface MathFavoriteControl {
  active: boolean;
  busy?: boolean;
  toggle: () => void;
}

export function useMathFavorite(stuid: string, qid: string | number, enabled = true) {
  const key = JSON.stringify([stuid, String(qid)]);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key: "", active: false, loading: true, error: "", removing: false, removeError: "" });
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState({ key, active: false, loading: true, error: "", removing: false, removeError: "" });
    mathApi.questionNotes(stuid, "收藏", qid)
      .then(response => {
        if (current) setState({ key, active: mathRows(response).length > 0, loading: false, error: "", removing: false, removeError: "" });
      })
      .catch(error => {
        if (current) setState({ key, active: false, loading: false, error: error.message || "收藏状态读取失败", removing: false, removeError: "" });
      });
    return () => { current = false; };
  }, [key, enabled, version]);
  const remove = async () => {
    if (!enabled || state.key !== key || !state.active || state.loading || state.removing) return;
    setState(current => ({ ...current, removing: true, removeError: "" }));
    try {
      const notes = mathRows(await mathApi.questionNotes(stuid, "收藏", qid));
      for (const note of notes) {
        const response = await mathApi.deleteNote(note.ID, stuid);
        if (mathData(response) === false) throw new Error("取消收藏未成功，请重试");
      }
      setState(current => current.key === key ? { ...current, active: false, removing: false } : current);
    } catch (error) {
      setState(current => current.key === key ? {
        ...current, removing: false, removeError: error instanceof Error ? error.message : "取消收藏失败，请重试",
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
