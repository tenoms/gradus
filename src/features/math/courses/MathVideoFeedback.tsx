import { useEffect, useState } from "react";
import { Flag, LoaderCircle } from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { useSession } from "../../../shared/auth/session";
import { mathGet, mathPost, mathRows } from "../api/math";
import type { MathRow } from "../api/math";
import "./math-video-feedback.css";
export default function MathVideoFeedback({
  vid,
  videoId = 0,
  stuid: actor,
  questionId,
  fileId,
}: {
  vid: string;
  videoId?: string | number;
  stuid?: string;
  questionId?: string | number;
  fileId?: string | number;
}) {
  const { session } = useSession();
  const stuid = actor || session.platforms.math?.user?.StuID || "";
  const [marksLoaded, setMarksLoaded] = useState(false),
    [rows, setRows] = useState<MathRow[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [flag, setFlag] = useState<MathRow>();
  const params = {
    BusType: 2,
    Type: 2,
    BusValue: vid,
    BusID: videoId,
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    mathGet("/api/sys_give/GetListBypage", {
      ...params,
      page: page + 1,
      limit: 10,
      SortDesc: "AddTime Desc",
      t: Date.now(),
    })
      .then((r) => {
        if (active) {
          const result = mathRows(r);
          setRows((v) => (page === 0 ? result : [...v, ...result]));
          setMore(result.length === 10);
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
  }, [vid, videoId, page, version]);
  useEffect(() => {
    if (!stuid || !questionId || !fileId) return;
    let active = true;
    setMarksLoaded(false);
    mathGet("/api/sys_give/GetListBypage", {
      BusType: 1,
      StuID: stuid,
      Type: 4,
      BusID: questionId,
      BaseType: "视频解析",
      BusValue: fileId,
      t: Date.now(),
      page: 1,
      limit: 10,
    })
      .then((response) => {
        if (active) {
          setFlag(mathRows(response)[0]);
          setMarksLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [questionId, fileId, stuid, version]);
  const refresh = () => {
    setPage(0);
    setVersion((v) => v + 1);
  };
  const toggleFlag = async () => {
    setBusy(true);
    setError("");
    try {
      if (flag)
        await mathPost("/api/sys_give/Del_sys_give", { ID: flag.ID });
      else
        await mathPost("/api/sys_give/Inner_sys_give", {
          BusType: 1,
          StuID: stuid,
          Type: 4,
          BusID: questionId,
          BaseType: "视频解析",
          BusValue: fileId,
        });
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="math-video-feedback">
      <div className="mvf-heading">
        <h4>视频评价</h4>
      </div>
      {questionId && fileId && (
        <div className="mvf-marks">
          <button
            className="btn btn-secondary"
            disabled={busy || !stuid || !marksLoaded}
            onClick={toggleFlag}
          >
            <Flag size={15} fill={flag ? "currentColor" : "none"} />
            {flag ? "已标记重点" : "标记重点"}
          </button>
        </div>
      )}
      {error && (
        <div className="math-error-text" role="alert">
          <p>{error}</p>
          <button className="math-text-button" onClick={refresh}>
            重新读取评价
          </button>
        </div>
      )}
      <div className="mvf-comments">
        {rows.map((r, i) => (
          <article key={r.ID || i}>
            <div>
              <strong>{r.UserNick || r.UserName || "学习者"}</strong>
              <span aria-label={`${r.BusNumber || 0}星`}>
                {"★".repeat(Math.min(5, Math.max(0, Number(r.BusNumber) || 0)))}
              </span>
              <time>
                {String(r.AddTime || "")
                  .replace("T", " ")
                  .slice(0, 16)}
              </time>
            </div>
            <RichContent content={r.Content || "已评价这段视频"} />
          </article>
        ))}
      </div>
      {loading ? (
        <p className="mvf-loading">
          <LoaderCircle className="spin" size={15} />
          正在读取评价…
        </p>
      ) : !rows.length && !error ? (
        <p className="math-muted">这段视频暂无评价</p>
      ) : more && !error ? (
        <button
          className="btn btn-secondary"
          onClick={() => setPage((v) => v + 1)}
        >
          更多评价
        </button>
      ) : null}
    </section>
  );
}
