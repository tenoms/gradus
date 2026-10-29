import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { paginationPages, paginationState } from "./pagination-model.mjs";
import "./pagination.css";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  label?: string;
  disabled?: boolean;
  contentRef?: RefObject<HTMLElement | null>;
}
export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50], label = "列表", disabled = false, contentRef }: PaginationProps) {
  const current = paginationState({ page, pageSize, total });
  const [jump, setJump] = useState(String(current.page));
  useEffect(() => { setJump(String(current.page)); }, [current.page]);
  const sizes = [...new Set([...pageSizeOptions, current.pageSize])].sort((a, b) => a - b);
  function showContent() { contentRef?.current?.scrollIntoView({ block: "start" }); }
  function go(value: number) { onPageChange(paginationState({ page: value, pageSize, total }).page); showContent(); }
  function jumpTo() { const target = paginationState({ page: Number(jump), pageSize, total }).page; setJump(String(target)); go(target); }
  return <nav className="pagination" aria-label={`${label}分页`}>
    <span className="pagination-summary" aria-live="polite">共 {current.total.toLocaleString("zh-CN")} 条{current.total > 0 && <> · 第 {current.start + 1}–{current.end} 条</>}</span>
    <div className="pagination-controls">
      {onPageSizeChange && <label className="pagination-size"><span className="sr-only">{label}每页条数</span><select aria-label={`${label}每页条数`} value={current.pageSize} disabled={disabled} onChange={event => { onPageSizeChange(Number(event.target.value)); showContent(); }}>{sizes.map(size => <option key={size} value={size}>{size} 条 / 页</option>)}</select></label>}
      <div className="pagination-pages">
        <button type="button" className="pagination-arrow" aria-label={`${label}上一页`} disabled={disabled || current.page <= 1} onClick={() => go(current.page - 1)}><ChevronLeft size={16} /></button>
        {paginationPages(current.page, current.pageCount).map((value, index) => value === "ellipsis" ? <span className="pagination-ellipsis" key={`gap-${index}`} aria-hidden="true">…</span> : <button type="button" key={value} className={`pagination-number ${value === current.page ? "is-current" : ""}`} aria-label={`${label}第${value}页`} aria-current={value === current.page ? "page" : undefined} disabled={disabled} onClick={() => go(value)}>{value}</button>)}
        <button type="button" className="pagination-arrow" aria-label={`${label}下一页`} disabled={disabled || current.page >= current.pageCount} onClick={() => go(current.page + 1)}><ChevronRight size={16} /></button>
      </div>
      {current.pageCount > 1 && <div className="pagination-jump"><span>跳至</span><input type="number" inputMode="numeric" min={1} max={current.pageCount} aria-label={`${label}跳转页码`} value={jump} disabled={disabled} onChange={event => setJump(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); jumpTo(); } }} /><span>/ {current.pageCount} 页</span><button type="button" disabled={disabled} onClick={jumpTo}>确定</button></div>}
    </div>
  </nav>;
}
