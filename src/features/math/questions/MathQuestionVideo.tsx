import { useRef, useState } from "react";
import { Play } from "lucide-react";
import MathVideoPlayer from "../media/MathVideoPlayer";
import { recordStudy } from "../../learning/state/store";
import MathVideoFeedback from "../courses/MathVideoFeedback";
import type { MathRow } from "../api/math";
import type { MathVideoOrigin } from "../media/math-video";
import { mathVideoSource } from "../media/math-video-source.mjs";

export default function MathQuestionVideo({ row, origin }: { row: MathRow; origin?: MathVideoOrigin }) {
  const { url, vid } = mathVideoSource(row);
  if (!url && !vid && !origin) return null;
  return <NativeQuestionVideo key={`${row.ID || ""}:${url}:${vid}:${JSON.stringify(origin)}`} row={row} origin={origin} />;
}

function NativeQuestionVideo({ row, origin }: { row: MathRow; origin?: MathVideoOrigin }) {
  const { url, vid } = mathVideoSource(row);
  const [open, setOpen] = useState(Boolean(url));
  const watched = useRef(false);
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
      <MathVideoPlayer
        row={row}
        origin={origin}
        controls
        playsInline
        preload="metadata"
        aria-label={row.Title || "数学题目视频解析"}
        study={{
          key: `math-question-video:${row.QuestionID || ""}:${row.ID || ""}:${vid || url}`,
          platform: "math",
          title: row.Title || "数学题目视频解析",
          path: "/study/question-bank",
        }}
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
      />
      {vid && <MathVideoFeedback
        vid={vid}
        videoId={row.VideoID || row.videoID || 0}
        questionId={row.QuestionID}
        fileId={row.ID}
      />}
    </div>
  );
}
