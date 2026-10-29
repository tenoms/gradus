import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ListChecks, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useDialogFocus } from "../../../shared/lib/focus";
import { computerLearningApi } from "./computer-learning";
import "./computer-record-reset.css";

export type ResetRecord = { id: string; title: string; answered: number };

/** Keeps the destructive request and its readback in one reviewable workflow. */
export function useComputerRecordReset({ records, scope, refresh }: { records: ResetRecord[]; scope: string; refresh: () => Promise<void> }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<"idle" | "resetting" | "refreshing">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<ResetRecord[]>([]);
  const pending = useRef(false), applied = useRef(false);
  const available = [...new Map(records.filter(row => row.id).map(row => [row.id, row])).values()];
  const chosen = available.filter(row => selected.includes(row.id));
  useEffect(() => {
    setSelecting(false); setSelected([]); setConfirming(false); setNotice(""); setError("");
    applied.current = false;
  }, [scope]);
  function exitSelection() {
    if (pending.current) return;
    setSelecting(false); setSelected([]); setNotice("");
  }
  function open() {
    if (pending.current || !chosen.length) return;
    setReview(chosen); setError(""); setNotice(""); applied.current = false; setConfirming(true);
  }
  function close() {
    if (pending.current) return;
    if (applied.current) {
      setSelected([]); setSelecting(false);
      setNotice("所选记录已重置，学习进度暂未刷新。");
    }
    setConfirming(false);
  }
  async function confirm() {
    if (pending.current || !review.length) return;
    pending.current = true; setError("");
    try {
      if (!applied.current) {
        setPhase("resetting");
        await computerLearningApi.resetRecords(review.map(row => row.id));
        applied.current = true;
      }
      setPhase("refreshing");
      await refresh();
      setSelected([]); setSelecting(false); setConfirming(false);
      setNotice(`已重置 ${review.length} 组学习记录，练习进度已更新。`);
    } catch (cause: any) {
      setError(`${applied.current ? "记录已重置，但进度刷新失败" : "重置未完成"}：${cause.message || "请稍后重试"}`);
    } finally {
      pending.current = false; setPhase("idle");
    }
  }
  return { selecting, selected, chosen, available, confirming, review, phase, busy: phase !== "idle", error, notice,
    applied: applied.current, start: () => { setSelecting(true); setNotice(""); }, exitSelection, open, close, confirm,
    toggle: (id: string) => { if (!pending.current) setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]); },
    selectAll: () => { if (!pending.current) setSelected(chosen.length === available.length ? [] : available.map(row => row.id)); },
  };
}

export type ComputerResetController = ReturnType<typeof useComputerRecordReset>;

export function ComputerResetToolbar({ reset, disabled = false }: { reset: ComputerResetController; disabled?: boolean }) {
  if (!reset.available.length) return null;
  if (!reset.selecting) return <div className="computer-reset-entry">
    <span>已有答题进度可按练习组重新开始</span>
    <button className="btn btn-secondary" disabled={disabled || reset.busy} onClick={reset.start}><RotateCcw size={15} />管理学习记录</button>
  </div>;
  return <div className="computer-reset-toolbar" aria-label="学习记录批量操作">
    <label className="computer-reset-select-all"><input type="checkbox" checked={reset.chosen.length === reset.available.length} onChange={reset.selectAll} disabled={disabled || reset.busy} />全选可重置记录</label>
    <span className="computer-reset-count" aria-live="polite">已选 <strong>{reset.chosen.length}</strong> / {reset.available.length} 组</span>
    <div className="computer-reset-actions">
      <button className="btn btn-secondary" onClick={reset.exitSelection} disabled={reset.busy}>取消选择</button>
      <button className="btn computer-reset-danger" onClick={reset.open} disabled={disabled || reset.busy || !reset.chosen.length}><RotateCcw size={15} />重置所选记录</button>
    </div>
  </div>;
}

export function ComputerResetNotice({ reset }: { reset: ComputerResetController }) {
  const notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (reset.notice) notice.current?.focus(); }, [reset.notice]);
  if (!reset.notice) return null;
  const needsRefresh = reset.applied && (reset.error || reset.busy);
  return <div className="computer-reset-notice-group">
    <p className="computer-reset-notice" role="status" tabIndex={-1} ref={notice}><Check size={17} />{reset.notice}</p>
    {needsRefresh && <div className="computer-reset-readback">
      {reset.error && <p role="alert">{reset.error}</p>}
      <button className="btn btn-secondary" disabled={reset.busy} onClick={() => void reset.confirm()}>{reset.busy ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}{reset.busy ? "正在更新进度…" : "重试刷新进度"}</button>
    </div>}
  </div>;
}

export function ComputerResetDialog({ reset }: { reset: ComputerResetController }) {
  return reset.confirming ? <ResetDialog reset={reset} /> : null;
}

function ResetDialog({ reset }: { reset: ComputerResetController }) {
  const root = useRef<HTMLElement>(null), title = useId(), description = useId();
  useDialogFocus(root);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    if (reset.busy) root.current?.focus();
    else if (document.activeElement === root.current) root.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [reset.busy]);
  return createPortal(<div className="modal-backdrop computer-reset-backdrop" onClick={reset.close}>
    <section className="modal computer-reset-dialog" role="dialog" aria-modal="true" aria-labelledby={title} aria-describedby={description} aria-busy={reset.busy} ref={root} tabIndex={-1} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); reset.close(); } }}>
      <button className="icon-button modal-close" aria-label="关闭重置确认" disabled={reset.busy} onClick={reset.close}><X size={20} /></button>
      <span className="computer-reset-icon"><AlertTriangle size={25} /></span>
      <span className="computer-reset-eyebrow">重新开始这几组练习</span>
      <h2 id={title}>{reset.applied ? "记录已重置" : `重置这 ${reset.review.length} 组学习记录？`}</h2>
      <p id={description} className="computer-reset-description">清除所选练习组的作答、答题报告与续学进度，之后需要重新作答。此操作无法撤销。</p>
      <ul className="computer-reset-review" aria-label="本次所选练习组">{reset.review.map(row => <li key={row.id}><span><ListChecks size={17} />{row.title}</span><small>已答 {row.answered} 题</small></li>)}</ul>
      <p className="computer-reset-preserved"><Check size={16} />收藏、错题、笔记和累计学习时长保留。</p>
      {reset.error && <p className="computer-reset-error" role="alert">{reset.error}</p>}
      <div className="computer-reset-dialog-actions">
        <button className="btn btn-secondary" disabled={reset.busy} onClick={reset.close}>{reset.applied ? "返回列表" : "保留记录"}</button>
        <button className="btn computer-reset-danger" disabled={reset.busy} onClick={() => void reset.confirm()}>{reset.busy ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />}{reset.phase === "resetting" ? "正在重置…" : reset.phase === "refreshing" ? "正在更新进度…" : reset.applied ? "重试刷新进度" : "确认重置"}</button>
      </div>
      {reset.busy && <p className="computer-reset-progress" role="status">{reset.phase === "resetting" ? "正在处理所选记录，请稍候。" : "记录已重置，正在读取最新学习进度。"}</p>}
    </section>
  </div>, document.body);
}
