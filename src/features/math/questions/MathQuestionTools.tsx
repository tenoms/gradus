import { useState } from "react";
import {
  BookOpen,
  MessageCircle,
  PencilLine,
  Star,
} from "lucide-react";
import MathNoteEditor from "../notebook/MathNoteEditor";
import { useMathFavorite } from "../notebook/use-math-favorite";
import MathDiscussion from "../community/MathDiscussion";
import type { NoteKind } from "../api/math";
import "../community/MathDiscussion.css";
export default function MathQuestionTools({
  stuid,
  qid,
  bookId = 0,
  source = "电子书",
  isCourse = false,
}: {
  stuid: string;
  qid: string | number;
  bookId?: number;
  source?: string;
  isCourse?: boolean;
}) {
  const [kind, setKind] = useState<NoteKind>(),
    [discussion, setDiscussion] = useState(false);
  const favorite = useMathFavorite(stuid, qid);
  return (
    <div className="mqt-tools">
      <div className="mqt-actions">
        <button className="btn btn-secondary" onClick={() => setKind("错题")}>
          <BookOpen size={15} />
          加入错题
        </button>
        <button
          className="btn btn-secondary math-favorite-button"
          aria-pressed={favorite.active}
          aria-busy={favorite.loading}
          disabled={favorite.loading}
          onClick={favorite.error ? favorite.reload : favorite.active ? () => void favorite.remove() : () => setKind("收藏")}
        >
          <Star size={15} fill={favorite.active ? "currentColor" : "none"} />
          {favorite.error ? "重新读取收藏状态" : favorite.active ? "取消收藏" : "收藏题目"}
        </button>
        <button className="btn btn-secondary" onClick={() => setKind("笔记")}>
          <PencilLine size={15} />
          记录笔记
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setDiscussion(!discussion)}
        >
          <MessageCircle size={15} />
          {discussion ? "收起讨论" : "题目讨论"}
        </button>
      </div>
      {favorite.removeError && <p className="error-banner" role="alert">{favorite.removeError}</p>}
      {discussion && (
        <div className="panel mqt-discussion">
          <MathDiscussion stuid={stuid} qid={qid} />
        </div>
      )}
      {kind && (
        <MathNoteEditor
          stuid={stuid}
          qid={qid}
          bookId={bookId}
          kind={kind}
          source={source}
          isCourse={isCourse}
          close={() => setKind(undefined)}
          onSaved={() => { if (kind === "收藏") favorite.saved(); }}
        />
      )}
    </div>
  );
}
