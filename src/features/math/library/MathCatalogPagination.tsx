import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { paginationState } from "../../../shared/ui/pagination/pagination-model.mjs";

export default function MathCatalogPagination({ page, pageSize, total, onPageChange, onPageSizeChange }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const state = paginationState({ page, pageSize, total });
  const [expanded, setExpanded] = useState(false);
  const [jump, setJump] = useState(String(state.page));
  useEffect(() => setJump(String(state.page)), [state.page]);
  function go(value: number) {
    const next = paginationState({ page: value, pageSize, total }).page;
    setJump(String(next));
    onPageChange(next);
  }
  return <nav className="math-catalog-pagination" aria-label="题目目录分页">
    <div className="math-catalog-page-row">
      <span aria-live="polite">共 {total} 题{total > 0 && ` · ${state.start + 1}–${state.end}`}</span>
      <div>
        <button type="button" aria-label="题目目录上一页" disabled={state.page <= 1} onClick={() => go(state.page - 1)}><ChevronLeft size={16} /></button>
        <span className="math-catalog-page-number" aria-label={`题目目录第${state.page}页，共${state.pageCount}页`}>{state.page} / {state.pageCount}</span>
        <button type="button" aria-label="题目目录下一页" disabled={state.page >= state.pageCount} onClick={() => go(state.page + 1)}><ChevronRight size={16} /></button>
        <button type="button" aria-label={expanded ? "收起分页设置" : "展开分页设置"} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={15} /></button>
      </div>
    </div>
    {expanded && <form className="math-catalog-page-settings" onSubmit={event => { event.preventDefault(); go(Number(jump)); }}>
      <label>每页<select aria-label="题目目录每页条数" value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))}>{[15, 30, 60].map(size => <option key={size} value={size}>{size} 题</option>)}</select></label>
      <label>跳至<input aria-label="题目目录跳转页码" type="number" min={1} max={state.pageCount} value={jump} onChange={event => setJump(event.target.value)} />页</label>
      <button type="submit">前往</button>
    </form>}
  </nav>;
}
