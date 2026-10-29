import { Check, Trash2 } from "lucide-react";
import type { StudyTask } from "../state/store";
import { deleteTask, toggleTask } from "../state/store";
import { platformLabel as label } from "../study-format";

export default function TaskRow({ task }: { task: StudyTask }) {
  return (
    <div className={`task-row ${task.done ? "is-done" : ""}`}>
      <button
        className="task-check"
        aria-label={`${task.done ? "取消完成" : "完成"} ${task.title}`}
        aria-pressed={task.done}
        onClick={() => toggleTask(task.id)}
      >
        {task.done && <Check size={14} />}
      </button>
      <div>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {label(task.platform)}
          <span>·</span>
          {task.date}
        </span>
      </div>
      <button
        className="icon-button task-delete"
        aria-label={`删除 ${task.title}`}
        onClick={() => deleteTask(task.id)}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
