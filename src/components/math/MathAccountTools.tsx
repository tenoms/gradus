import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import RichContent from "../RichContent";
import { mathCommand, mathRows, mathTitle } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import MathStudyProfile from "./MathStudyProfile";
import MathStudyHistory from "./MathStudyHistory";

export default function MathAccountTools({
  user,
  onQuestion,
  tab = "个人资料",
}: {
  user: MathRow;
  onQuestion: (row: MathRow) => void;
  tab?: string;
}) {
  const stuid = String(user.StuID || "");
  if (tab === "学习记录") return <MathStudyHistory stuid={stuid} onQuestion={onQuestion} />;
  if (tab === "学习榜单") return <Rankings onQuestion={onQuestion} />;
  return <MathStudyProfile user={user} />;
}
function RemoteList({
  id,
  load,
  onQuestion,
}: {
  id: string;
  load: () => Promise<any>;
  onQuestion?: (row: MathRow) => void;
}) {
  const [rows, setRows] = useState<MathRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    load()
      .then((r) => {
        if (active) setRows(mathRows(r));
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (busy)
    return (
      <div className="math-state">
        <LoaderCircle className="spin" size={23} />
        <p>正在读取数学学习记录…</p>
      </div>
    );
  if (error)
    return (
      <div className="math-state math-error">
        <p>{error}</p>
      </div>
    );
  if (!rows.length)
    return (
      <div className="math-state">
        <BookOpen size={28} />
        <p>当前暂无记录</p>
      </div>
    );
  return (
    <div className="math-content-list math-account-records">
      {rows.map((r, i) => (
        <button
          key={r.ID || i}
          disabled={!onQuestion || !(r.QuestionID || r.questionID || r.qID)}
          onClick={() => onQuestion?.(r)}
        >
          <div className="math-list-icon">
            {id.startsWith("rank") ? (
              <span>{i + 1}</span>
            ) : (
              <BookOpen size={19} />
            )}
          </div>
          <span>
            <strong>
              {r.BookName ||
                r.QuestionName ||
                r.Title ||
                r.RuleName ||
                mathTitle(r)}
            </strong>
            <small>
              {r.QuestionPage ? `第 ${r.QuestionPage} 页 · ` : ""}
              {r.QuestionSort ? `第 ${r.QuestionSort} 题 · ` : ""}
              {r.AddTime
                ? String(r.AddTime).replace("T", " ").slice(0, 16)
                : r.BusValue
                  ? `热度 ${r.BusValue}`
                  : ""}
            </small>
            {r.Content && <RichContent content={r.Content} />}
          </span>
          {onQuestion && (r.QuestionID || r.qID) && <ChevronRight size={16} />}
        </button>
      ))}
    </div>
  );
}
function Rankings({ onQuestion }: { onQuestion: (row: MathRow) => void }) {
  const [type, setType] = useState("周错题");
  return (
    <div>
      <div className="math-account-subtabs">
        {["周错题", "周收藏", "错题高频", "收藏高频"].map((t) => (
          <button
            key={t}
            className={t === type ? "active" : ""}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <RemoteList
        id={`rank-${type}`}
        load={() =>
          mathCommand("GetQuestionNoteRankList", {
            System_Station_ID: 1,
            Type: type,
          })
        }
        onQuestion={onQuestion}
      />
    </div>
  );
}
