import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Play } from "lucide-react";
import LearningVideo from "../../../shared/media/LearningVideo";
import { recordStudy } from "../../learning/state/store";
import MathVideoFeedback from "../courses/MathVideoFeedback";
import type { MathRow } from "../api/math";
import { loadMathVideo } from "../media/math-video";
import type { MathVideo } from "../media/math-video";
import { mathVideoSource } from "../media/math-video-source.mjs";

export default function MathQuestionVideo({ row }: { row: MathRow }) {
  const { url, vid } = mathVideoSource(row);
  if (!url && !vid) return null;
  return <NativeQuestionVideo key={`${row.ID || ""}:${url}:${vid}`} row={row} />;
}

function NativeQuestionVideo({ row }: { row: MathRow }) {
  const { url, vid } = mathVideoSource(row);
  const [open, setOpen] = useState(Boolean(url));
  const [video, setVideo] = useState<MathVideo>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const watched = useRef(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setVideo(undefined);
    setError("");
    loadMathVideo(row).then(result => {
      if (active) setVideo(result);
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => { active = false; };
  }, [open, version]);
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
      {video && <LearningVideo
        key={`${video.url}:${version}`}
        src={video.url}
        poster={video.poster}
        controls
        playsInline
        preload="metadata"
        aria-label={row.Title || "数学题目视频解析"}
        onTimeUpdate={event => {
          if (!watched.current && event.currentTarget.currentTime > 0) {
            watched.current = true;
            recordStudy({
              platform: "math",
              type: "video",
              title: row.Title || "数学题目视频解析",
              path: "/study/question-bank",
            });
          }
        }}
      />}
      {!video && !error && (
        <p className="math-video-status" role="status">
          <LoaderCircle className="spin" size={16} />
          正在加载视频解析…
        </p>
      )}
      {error && (
        <div className="math-video-status math-error-text">
          <p role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => setVersion(v => v + 1)}>
            重试播放
          </button>
        </div>
      )}
      {vid && <MathVideoFeedback
        vid={vid}
        videoId={row.VideoID || row.videoID || 0}
        questionId={row.QuestionID}
        fileId={row.ID}
      />}
    </div>
  );
}
