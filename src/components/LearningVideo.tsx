import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { VideoHTMLAttributes } from "react";
import Hls from "hls.js";
import { RefreshCw } from "lucide-react";

/** Uses native HLS where available, and MediaSource HLS for desktop browsers. */
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
    const isHls = /\.m3u8(?:[?#]|$)/i.test(src);
    if (isHls && Hls.isSupported()) {
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError("视频流加载失败，请重试。");
          setErrorDetail(data.details);
        }
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else if (isHls && !video.canPlayType("application/vnd.apple.mpegurl"))
      setError("当前浏览器不支持此视频格式，请使用支持 HLS 的浏览器。");
    else video.src = src;
    return () => {
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
      <video {...props} ref={element} />
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
