import { useState } from "react";
import {
  BookOpen,
  MessageCircle,
  PencilLine,
  Star,
} from "lucide-react";
import MathNoteEditor from "./MathNoteEditor";
import MathDiscussion from "./MathDiscussion";
import type { NoteKind } from "../../platforms/math";
import "./MathDiscussion.css";
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
  return (
    <div className="mqt-tools">
      <div className="mqt-actions">
        <button className="btn btn-secondary" onClick={() => setKind("错题")}>
          <BookOpen size={15} />
          加入错题
        </button>
        <button className="btn btn-secondary" onClick={() => setKind("收藏")}>
          <Star size={15} />
          收藏题目
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
        />
      )}
    </div>
  );
}
