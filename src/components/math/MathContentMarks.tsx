import { useEffect, useState } from "react";
import { Flag, Heart } from "lucide-react";
import { useSession } from "../../lib/session";
import { mathCommand, mathGet, mathPost, mathRows } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import { mathContentLikeDelete, mathContentMarkType } from "../../platforms/math-content-marks";
import { MathFeedbackButton } from "./MathQuestionTools";
export default function MathContentMarks({
  fileId,
  questionId,
  baseType,
  bookId = 0,
}: {
  fileId: string | number;
  questionId: string | number;
  baseType: string;
  bookId?: number;
}) {
  const { session } = useSession();
  const stuid = session.platforms.math?.user?.StuID || "";
  const markType = mathContentMarkType(baseType);
  const [like, setLike] = useState<MathRow>(),
    [marked, setMarked] = useState<MathRow>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    if (!stuid || !questionId || !fileId || !markType) return;
    setLoading(true);
    setError("");
    Promise.all([
      mathCommand("GetQuestionFilesGiveAuto", {
        QuestionID: questionId,
        IsValid: 1,
        StuID: stuid,
        BusID: fileId,
        BusType: markType,
        t: Date.now(),
      }),
      mathGet("/api/sys_give/GetListBypage", {
        BusType: 1,
        StuID: stuid,
        Type: 4,
        System_Station_ID: 1,
        BusID: questionId,
        BaseType: markType,
        BusValue: fileId,
        t: Date.now(),
        page: 1,
        limit: 10,
      }),
    ])
      .then(([a, b]) => {
        if (active) {
          setLike(mathRows(a)[0]);
          setMarked(mathRows(b)[0]);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stuid, fileId, questionId, markType, version]);
  if (!stuid || !questionId || !fileId || !markType) return null;
  const toggle = async (type: "like" | "flag") => {
    setBusy(true);
    setError("");
    try {
      if (type === "like") {
        if (like)
          await mathPost("/api/question_files_give/Del_question_files_give",
            mathContentLikeDelete(stuid, like.ID, fileId));
        else
          await mathPost("/api/question_files_give/Inner_question_files_give", {
            StuID: stuid,
            BusID: fileId,
            QuestionID: questionId,
            BusType: markType,
            IsValid: 1,
            System_Station_ID: 1,
          });
      } else if (marked)
        await mathPost("/api/sys_give/Del_sys_give", { ID: marked.ID });
      else
        await mathPost("/api/sys_give/Inner_sys_give", {
          BusType: 1,
          StuID: stuid,
          Type: 4,
          System_Station_ID: 1,
          BusID: questionId,
          BaseType: markType,
          BusValue: fileId,
        });
      setVersion((v) => v + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mmt-marks">
      <button
        className="btn btn-secondary"
        disabled={busy || loading || !!error}
        onClick={() => toggle("like")}
      >
        <Heart size={15} fill={like ? "currentColor" : "none"} />
        {like ? "已点赞" : "点赞内容"}
      </button>
      <button
        className="btn btn-secondary"
        disabled={busy || loading || !!error}
        onClick={() => toggle("flag")}
      >
        <Flag size={15} fill={marked ? "currentColor" : "none"} />
        {marked ? "已标记重点" : "标记重点"}
      </button>
      <MathFeedbackButton
        stuid={stuid}
        qid={questionId}
        bookId={bookId}
        baseType={markType}
      />
      {error && (
        <p className="math-error-text" role="alert">
          {error}
          <button
            className="math-text-button"
            onClick={() => setVersion((v) => v + 1)}
          >
            重新加载标记
          </button>
        </p>
      )}
    </div>
  );
}
