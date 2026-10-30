import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { useSession } from "../../../shared/auth/session";
import { mathGet, mathPost, mathRows } from "../api/math";
import type { MathRow } from "../api/math";
import { mathContentMarkType } from "./math-content-marks";
export default function MathContentMarks({
  fileId,
  questionId,
  baseType,
}: {
  fileId: string | number;
  questionId: string | number;
  baseType: string;
}) {
  const { session } = useSession();
  const stuid = session.platforms.math?.user?.StuID || "";
  const markType = mathContentMarkType(baseType);
  const [marked, setMarked] = useState<MathRow>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    if (!stuid || !questionId || !fileId || !markType) return;
    setLoading(true);
    setError("");
    mathGet("/api/sys_give/GetListBypage", {
      BusType: 1,
      StuID: stuid,
      Type: 4,
      BusID: questionId,
      BaseType: markType,
      BusValue: fileId,
      t: Date.now(),
      page: 1,
      limit: 10,
    })
      .then((response) => {
        if (active) setMarked(mathRows(response)[0]);
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
  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      if (marked)
        await mathPost("/api/sys_give/Del_sys_give", { ID: marked.ID });
      else
        await mathPost("/api/sys_give/Inner_sys_give", {
          BusType: 1,
          StuID: stuid,
          Type: 4,
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
        onClick={toggle}
      >
        <Flag size={15} fill={marked ? "currentColor" : "none"} />
        {marked ? "已标记重点" : "标记重点"}
      </button>
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
