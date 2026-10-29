import { CalendarDays, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Platform } from "../../../shared/api/client";
import { useDialogFocus } from "../../../shared/lib/focus";
import { addTask } from "../state/store";
import { today } from "../study-format";

export default function TaskEditor({
  platform,
  onClose,
}: {
  platform: Platform;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [subject, setSubject] = useState(platform);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="modal small-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <button
          className="icon-button modal-close"
          aria-label="关闭"
          onClick={onClose}
        >
          <X />
        </button>
        <div className="icon-tile">
          <CalendarDays />
        </div>
        <h2 id="task-title">为下一步，留个计划</h2>
        <p className="muted">小而具体的目标，更容易坚持。</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            addTask({ title: title.trim(), date, platform: subject });
            onClose();
          }}
        >
          <label className="field-label">
            学习任务
            <input
              ref={input}
              className="input"
              maxLength={160}
              placeholder="例如：完成高等数学第一章练习"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <div className="form-row">
            <label className="field-label">
              科目
              <select
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value as Platform)}
              >
                <option value="math">考研数学</option>
                <option value="computer">计算机 408</option>
              </select>
            </label>
            <label className="field-label">
              计划日期
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
          </div>
          <button className="btn btn-primary full-width" type="submit">
            <Plus size={17} />
            添加计划
          </button>
        </form>
      </section>
    </div>
  );
}
