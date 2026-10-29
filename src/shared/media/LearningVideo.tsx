import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { VideoHTMLAttributes } from "react";
import type Hls from "hls.js";
import { RefreshCw } from "lucide-react";

/** Uses MediaSource HLS when supported, with native HLS as a fallback. */
const LearningVideo = forwardRef<
  HTMLVideoElement,
  VideoHTMLAttributes<HTMLVideoElement> & { src: string }
>(function LearningVideo({ src, ...props }, ref) {
  const element = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [attempt, setAttempt] = useState(0);
  useImperativeHandle(ref, () => element.current!);
  useEffect(() => {
    const video = element.current;
    if (!video) return;
    setError("");
    setErrorDetail("");
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
          else setError("当前浏览器不支持此视频格式，请使用支持 HLS 的浏览器。");
          return;
        }
        hls = new HlsPlayer();
        hls.on(HlsPlayer.Events.ERROR, (_, data) => {
          if (!disposed && data.fatal) {
            setError("视频流加载失败，请重试。");
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
        onError={(event) => {
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
