import { useEffect, useState } from "react";
import { mathApi, mathRows } from "../api/math";
import "./math-favorite.css";

export interface MathFavoriteControl {
  active: boolean;
  busy?: boolean;
  toggle: () => void;
}

export function useMathFavorite(stuid: string, qid: string | number, enabled = true) {
  const key = JSON.stringify([stuid, String(qid)]);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key: "", active: false, loading: true, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState({ key, active: false, loading: true, error: "" });
    mathApi.questionNotes(stuid, "收藏", qid)
      .then(response => {
        if (current) setState({ key, active: mathRows(response).length > 0, loading: false, error: "" });
      })
      .catch(error => {
        if (current) setState({ key, active: false, loading: false, error: error.message || "收藏状态读取失败" });
      });
    return () => { current = false; };
  }, [key, enabled, version]);
  return {
    active: state.key === key && state.active,
    loading: enabled && (state.key !== key || state.loading),
    error: state.key === key ? state.error : "",
    reload: () => setVersion(value => value + 1),
    saved: () => setState({ key, active: true, loading: false, error: "" }),
  };
}
