import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { VideoHTMLAttributes } from "react";
import type Hls from "hls.js";
import { PictureInPicture2, RefreshCw } from "lucide-react";
import "./learning/learning-workbench.css";

/** Uses native HLS where available, and MediaSource HLS for desktop browsers. */
const LearningVideo = forwardRef<
  HTMLVideoElement,
  VideoHTMLAttributes<HTMLVideoElement> & { src: string }
>(function LearningVideo({ src, ...props }, ref) {
  const element = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [pictureError, setPictureError] = useState("");
  useImperativeHandle(ref, () => element.current!);
  useEffect(() => {
    const video = element.current;
    if (!video) return;
    setError("");
    setErrorDetail("");
    setPictureError("");
    let hls: Hls | undefined;
    let disposed = false;
    const isHls = /\.m3u8(?:[?#]|$)/i.test(src);
    async function attachSource() {
      if (!video || disposed) return;
      if (!isHls || video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        return;
      }
      try {
        const { default: HlsPlayer } = await import("hls.js");
        if (disposed) return;
        if (!HlsPlayer.isSupported()) {
          setError("当前浏览器不支持此视频格式，请使用支持 HLS 的浏览器。");
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
        onRateChange={(event) => {
          setSpeed(event.currentTarget.playbackRate);
          props.onRateChange?.(event);
        }}
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = speed;
          props.onLoadedMetadata?.(event);
        }}
        onError={(event) => {
          setError("视频加载失败，请检查网络后重试。");
          props.onError?.(event);
        }}
      />
      {props.controls !== false && (
        <div className="learning-video-controls">
          <label>
            播放速度
            <select
              aria-label="视频播放速度"
              value={speed}
              onChange={(event) => {
                const rate = Number(event.target.value);
                if (element.current) element.current.playbackRate = rate;
                setSpeed(rate);
              }}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                <option key={rate} value={rate}>{rate}×</option>
              ))}
              {![0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(speed) && <option value={speed}>{speed}×</option>}
            </select>
          </label>
          {document.pictureInPictureEnabled && (
            <button
              type="button"
              className="text-link"
              onClick={async () => {
                const video = element.current;
                if (!video) return;
                setPictureError("");
                try {
                  if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
                  else await video.requestPictureInPicture();
                } catch {
                  setPictureError("视频开始播放后可打开画中画。");
                }
              }}
            >
              <PictureInPicture2 size={15} />
              画中画
            </button>
          )}
          {pictureError && <span role="status">{pictureError}</span>}
        </div>
      )}
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
