import { useEffect, useState } from "react";
import { Flag, Heart, LoaderCircle, Star } from "lucide-react";
import RichContent from "../RichContent";
import { useSession } from "../../lib/session";
import { mathCommand, mathPost, mathRows } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import { MathFeedbackButton } from "./MathQuestionTools";
import "./math-video-feedback.css";
export default function MathVideoFeedback({
  vid,
  videoId = 0,
  stuid: actor,
  questionId,
  fileId,
  bookId = 0,
}: {
  vid: string;
  videoId?: string | number;
  stuid?: string;
  questionId?: string | number;
  fileId?: string | number;
  bookId?: number;
}) {
  const { session } = useSession();
  const stuid = actor || session.platforms.math?.user?.StuID || "";
  const [ownLoaded, setOwnLoaded] = useState(false),
    [marksLoaded, setMarksLoaded] = useState(false),
    [rows, setRows] = useState<MathRow[]>([]),
    [mine, setMine] = useState<MathRow>({}),
    [score, setScore] = useState(5),
    [text, setText] = useState(""),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0),
    [editing, setEditing] = useState(false),
    [like, setLike] = useState<MathRow>(),
    [flag, setFlag] = useState<MathRow>();
  const params = {
    BusType: 2,
    Type: 2,
    System_Station_ID: 1,
    BusValue: vid,
    BusID: videoId,
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    mathCommand("GetSysGiveAutoLimit", {
      ...params,
      offset: page * 10,
      limit: 10,
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
    if (!stuid) return;
    let active = true;
    setOwnLoaded(false);
    mathCommand("GetSysGiveAutoLimit", {
      ...params,
      StuID: stuid,
      offset: 0,
      limit: 1,
    })
      .then((r) => {
        if (active) {
          const value = mathRows(r)[0] || {};
          setMine(value);
          setOwnLoaded(true);
          setScore(Number(value.BusNumber) || 5);
          setText(value.Content || "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [vid, videoId, stuid, version]);
  useEffect(() => {
    if (!stuid || !questionId || !fileId) return;
    let active = true;
    setMarksLoaded(false);
    Promise.all([
      mathCommand("GetQuestionFilesGiveAuto", {
        QuestionID: questionId,
        IsValid: 1,
        StuID: stuid,
        BusID: fileId,
        BusType: "",
      }),
      mathCommand("GetSysGiveAuto", {
        BusType: 1,
        StuID: stuid,
        Type: 4,
        System_Station_ID: 1,
        BusID: questionId,
        BaseType: "视频解析",
        BusValue: fileId,
      }),
    ])
      .then(([a, b]) => {
        if (active) {
          setLike(mathRows(a)[0]);
          setFlag(mathRows(b)[0]);
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
  const toggle = async (type: "like" | "flag") => {
    setBusy(true);
    setError("");
    try {
      if (type === "like") {
        if (like)
          await mathPost("/api/question_files_give/Del_question_files_give", {
            ID: like.ID,
            StuID: stuid,
          });
        else
          await mathPost("/api/question_files_give/Inner_question_files_give", {
            StuID: stuid,
            BusID: fileId,
            QuestionID: questionId,
            BusType: "视频解析",
            IsValid: 1,
            System_Station_ID: 1,
          });
      } else if (flag)
        await mathPost("/api/sys_give/Del_sys_give", { ID: flag.ID });
      else
        await mathPost("/api/sys_give/Inner_sys_give", {
          BusType: 1,
          StuID: stuid,
          Type: 4,
          System_Station_ID: 1,
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
        <button
          className="btn btn-secondary"
          disabled={!stuid || !ownLoaded || busy}
          onClick={() => setEditing(!editing)}
        >
          <Star size={15} />
          {mine.ID ? "编辑我的评价" : "评价这段讲解"}
        </button>
      </div>
      {questionId && fileId && (
        <div className="mvf-marks">
          <button
            className="btn btn-secondary"
            disabled={busy || !stuid || !marksLoaded}
            onClick={() => toggle("like")}
          >
            <Heart size={15} fill={like ? "currentColor" : "none"} />
            {like ? "已点赞" : "点赞视频"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy || !stuid || !marksLoaded}
            onClick={() => toggle("flag")}
          >
            <Flag size={15} fill={flag ? "currentColor" : "none"} />
            {flag ? "已标记重点" : "标记重点"}
          </button>
          <MathFeedbackButton
            stuid={stuid}
            qid={questionId}
            bookId={bookId}
            baseType="视频解析"
          />
        </div>
      )}
      {editing && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await mathPost("/api/sys_give/Inner_sys_give", {
                ...params,
                ID: mine.ID || 0,
                StuID: stuid,
                BusNumber: score,
                Content: text.trim(),
              });
              setNotice("你的评价已同步到数学平台");
              setEditing(false);
              refresh();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="mvf-stars" role="group" aria-label="视频评分">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n}星`}
                aria-pressed={n === score}
                onClick={() => setScore(n)}
              >
                <Star size={22} fill={n <= score ? "currentColor" : "none"} />
              </button>
            ))}
            <span>{score} / 5</span>
          </div>
          <label className="math-field">
            学习感受
            <textarea
              className="input"
              rows={3}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="这段讲解是否帮助你理解了思路？"
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "正在保存…" : "保存评价"}
          </button>
        </form>
      )}
      {notice && (
        <p className="math-account-notice" role="status">
          {notice}
        </p>
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
