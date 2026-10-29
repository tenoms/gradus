import { CalendarDays, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Platform } from "../../../shared/api/client";
import Pagination from "../../../shared/ui/pagination/Pagination";
import { usePagination } from "../../../shared/ui/pagination/use-pagination";
import { useStudyData } from "../state/store";
import TaskRow from "./TaskRow";

export default function StudyPlan({ platform, onAdd }: { platform: Platform; onAdd: () => void }) {
  const { tasks } = useStudyData();
  const listRef = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState("all");
  const [date, setDate] = useState("");
  const visible = tasks
    .filter(
      (t) =>
        (filter === "all" || (filter === "done" ? t.done : !t.done)) &&
        (!date || t.date === date),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const pagination = usePagination({ total: visible.length, resetKey: `${filter}:${date}` });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1 className="sr-only">学习计划</h1>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          <Plus size={16} />
          添加计划
        </button>
      </div>
      <section className="panel pagination-content" ref={listRef}>
        <div className="filter-bar">
          <div className="tabs">
            {[
              ["all", "全部计划"],
              ["pending", "待完成"],
              ["done", "已完成"],
            ].map(([id, text]) => (
              <button
                className={filter === id ? "active" : ""}
                key={id}
                onClick={() => setFilter(id)}
              >
                {text}
              </button>
            ))}
          </div>
          <label className="date-filter">
            <span>日期</span>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {date && (
              <button
                className="icon-button"
                onClick={() => setDate("")}
                aria-label="清除日期"
              >
                <X size={15} />
              </button>
            )}
          </label>
        </div>
        {visible.length ? (
          visible.slice(pagination.start, pagination.end).map((t) => <TaskRow task={t} key={t.id} />)
        ) : (
          <div className="empty-state">
            <CalendarDays size={38} />
            <h3>{tasks.length ? "没有符合条件的计划" : "给学习一些方向"}</h3>
            <p>从一个具体的小目标开始，完成后记得给自己打个勾。</p>
            <button className="btn btn-secondary" onClick={onAdd}>
              <Plus size={16} />
              创建学习计划
            </button>
          </div>
        )}
        <Pagination page={pagination.page} pageSize={pagination.pageSize} total={visible.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} label="学习计划" contentRef={listRef} />
      </section>
      <p className="footnote">
        计划随你的账号同步，可在不同设备继续；也可在设置中导出备份。
      </p>
    </>
  );
}
