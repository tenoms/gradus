import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Play } from "lucide-react";
import LearningVideo from "../LearningVideo";
import { recordStudy } from "../../lib/store";
import { loadMathPolyvSDK } from "./MathPolyv";
import MathVideoFeedback from "./MathVideoFeedback";
import type { MathRow } from "../../platforms/math";
import { mathQuestionMedia } from "./math-question-presentation.mjs";

export default function MathQuestionVideo({ row }: { row: MathRow }) {
  const media = mathQuestionMedia(row);
  if (media.kind === "video") return <div className="math-question-video"><LearningVideo src={media.url} controls preload="metadata" aria-label={row.Title || "数学题目视频解析"} /></div>;
  return <MathPolyvQuestionVideo row={row} />;
}
function MathPolyvQuestionVideo({ row }: { row: MathRow }) {
  const vid = String(row.PolyvVID || row.PlayVid || row.Vid || row.vid || row.BusValue || "");
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const watched = useRef(false);
  useEffect(() => {
    if (!open || !vid) return;
    let active = true;
    let player: any;
    setReady(false);
    setError("");
    loadMathPolyvSDK()
      .then(() => {
        if (!active || !host.current) return;
        const config: any = {
          wrap: host.current,
          vid,
          width: "100%",
          height: "100%",
          autoplay: false,
          forceH5: true,
        };
        const playsafe =
          row.playsafe || row.PlaySafe || row.playSafe || row.PlayToken;
        if (playsafe) config.playsafe = playsafe;
        if (row.sign && row.ts) {
          config.sign = row.sign;
          config.ts = row.ts;
        }
        player = (window as any).polyvPlayer(config);
        player.on("s2j_onPlayerInitOver", () => {
          if (active) setReady(true);
        });
        const fail = () => {
          if (active)
            setError(
              "此视频暂时无法播放，请确认当前账号的学习权限或稍后重试。",
            );
        };
        player.on("serverError", fail);
        player.on("s2j_onPlayerError", fail);
        player.on("onTimeupdate", () => {
          if (!watched.current) {
            watched.current = true;
            recordStudy({
              platform: "math",
              type: "video",
              title: row.Title || "数学题目视频解析",
              path: "/study/question-bank",
            });
          }
        });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      player?.destroy?.();
    };
  }, [vid, open, version]);
  if (!vid) return null;
  if (!open)
    return (
      <div className="math-question-video math-question-video-placeholder">
        <button className="math-question-video-start" onClick={() => setOpen(true)}>
          <Play size={28} />
          <span>播放视频解析</span>
        </button>
      </div>
    );
  return (
    <div className="math-question-video">
      <div className="math-question-polyv" ref={host} />
      {!ready && !error && (
        <p className="math-video-status">
          <LoaderCircle className="spin" size={16} />
          正在加载视频解析…
        </p>
      )}
      {error && (
        <div className="math-video-status math-error-text">
          <p role="alert">{error}</p>
          <button
            className="btn btn-secondary"
            onClick={() => setVersion((v) => v + 1)}
          >
            重试播放
          </button>
        </div>
      )}
      <MathVideoFeedback
        vid={vid}
        videoId={row.VideoID || row.videoID || 0}
        questionId={row.QuestionID}
        fileId={row.ID}
        bookId={Number(row.BookID || 0)}
      />
    </div>
  );
}
