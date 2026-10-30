import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { VideoHTMLAttributes } from "react";
import type Hls from "hls.js";
import { RefreshCw } from "lucide-react";
import { MediaStudyContext } from "./MediaStudyContext";
import type { MediaStudy, MediaStudyHandle } from "./MediaStudyContext";

/** Uses MediaSource HLS when supported, with native HLS as a fallback. */
const LearningVideo = forwardRef<
  HTMLVideoElement,
  VideoHTMLAttributes<HTMLVideoElement> & { src: string; study?: MediaStudy }
>(function LearningVideo({ src, study, ...props }, ref) {
  const element = useRef<HTMLVideoElement>(null);
  const registerStudy = useContext(MediaStudyContext);
  const studyTimer = useRef<MediaStudyHandle | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [attempt, setAttempt] = useState(0);
  useImperativeHandle(ref, () => element.current!);
  useEffect(() => {
    const timer = study && registerStudy?.(study);
    timer?.setEnabled(playing);
    studyTimer.current = timer;
    return () => { timer?.stop(); studyTimer.current = undefined; };
  }, [registerStudy, study?.platform, study?.title, study?.path, study?.key, src]);
  useEffect(() => { studyTimer.current?.setEnabled(playing); }, [playing]);
  useEffect(() => {
    const video = element.current;
    if (!video) return;
    setError("");
    setErrorDetail("");
    setPlaying(false);
    let hls: Hls | undefined;
    let disposed = false;
    const isHls = /\.m3u8(?:[?#]|$)/i.test(src);
    async function attachSource() {
      if (!video || disposed) return;
      if (!isHls) {
        video.src = src;
        return;
      }
      try {
        const { default: HlsPlayer } = await import("hls.js");
        if (disposed) return;
        // Some browsers advertise native HLS but cannot play all HLS assets.
        if (!HlsPlayer.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = src;
          else setError("当前浏览器无法播放此视频，请换用其他浏览器。");
          return;
        }
        hls = new HlsPlayer();
        hls.on(HlsPlayer.Events.ERROR, (_, data) => {
          if (!disposed && data.fatal) {
            setPlaying(false);
            setError("视频加载失败，请重试。");
            setErrorDetail(data.details);
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        if (!disposed) setError("视频播放器加载失败，请检查网络后重试。");
      }
    }
    void attachSource();
    return () => {
      disposed = true;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, attempt]);
  return (
    <div
      className="learning-video"
      data-playback-error={errorDetail || undefined}
    >
      <video
        {...props}
        ref={element}
        onPlaying={event => { setPlaying(true); props.onPlaying?.(event); }}
        onPause={event => { setPlaying(false); props.onPause?.(event); }}
        onWaiting={event => { setPlaying(false); props.onWaiting?.(event); }}
        onSeeking={event => { setPlaying(false); props.onSeeking?.(event); }}
        onSeeked={event => {
          if (!event.currentTarget.paused && event.currentTarget.readyState >= 3) setPlaying(true);
          props.onSeeked?.(event);
        }}
        onEnded={event => { setPlaying(false); props.onEnded?.(event); }}
        onEmptied={event => { setPlaying(false); props.onEmptied?.(event); }}
        onError={(event) => {
          setPlaying(false);
          setError("视频加载失败，请检查网络后重试。");
          props.onError?.(event);
        }}
      />
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="text-link"
            onClick={() => setAttempt((n) => n + 1)}
          >
            <RefreshCw size={14} />
            重试
          </button>
        </div>
      )}
    </div>
  );
});
export default LearningVideo;
