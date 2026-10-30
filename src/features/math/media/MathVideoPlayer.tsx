import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { VideoHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import LearningVideo from "../../../shared/media/LearningVideo";
import type { MediaStudy } from "../../../shared/media/MediaStudyContext";
import type { MathRow } from "../api/math";
import { loadMathVideo } from "./math-video";
import type { MathVideo, MathVideoOrigin } from "./math-video";
import { mathVideoRequest, mathVideoSource } from "./math-video-source.mjs";

type Playback = { position: number; playing: boolean; observed: boolean };
type PlaybackSession = Playback & { active: boolean; loading: boolean; refreshed: boolean; resume?: Playback };
type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  row: MathRow;
  origin?: MathVideoOrigin;
  study?: MediaStudy;
};

/** Resolves stored math media, refreshing a failed address once per selected video. */
const MathVideoPlayer = forwardRef<HTMLVideoElement, Props>(function MathVideoPlayer({ row, origin, study, ...props }, ref) {
  const element = useRef<HTMLVideoElement>(null);
  const session = useRef<PlaybackSession | undefined>(undefined);
  const [video, setVideo] = useState<MathVideo>();
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const identity = JSON.stringify([mathVideoRequest(row), mathVideoSource(row).url, origin]);
  useImperativeHandle(ref, () => element.current!, [video?.url, version]);

  async function load(current: PlaybackSession, refresh: boolean, preserve: boolean) {
    if (!current.active || current.loading) return;
    if (preserve && !current.resume) {
      const position = element.current?.currentTime;
      current.resume = {
        position: Number.isFinite(position) && (position! > 0 || current.position === 0) ? position! : current.position,
        playing: current.playing,
        observed: current.observed || Number.isFinite(position) && position! > 0,
      };
    }
    current.loading = true;
    setLoading(true); setError("");
    try {
      const source = await loadMathVideo(row, { origin, refresh });
      if (!current.active) return;
      setVideo(source);
      setVersion(value => value + 1);
    } catch (cause) {
      if (current.active) setError(cause instanceof Error ? cause.message : "视频暂时无法播放，请重试。");
    } finally {
      current.loading = false;
      if (current.active) setLoading(false);
    }
  }
  useEffect(() => {
    const current: PlaybackSession = { active: true, loading: false, refreshed: false, position: 0, playing: false, observed: false };
    session.current = current;
    setVideo(undefined);
    void load(current, false, false);
    return () => { current.active = false; };
  }, [identity]);
  function sourceFailed() {
    const current = session.current;
    if (!current?.active || current.loading) return;
    if (current.refreshed) { setError("视频暂时无法播放，请重试。"); return; }
    current.refreshed = true;
    void load(current, true, true);
  }
  function retry() {
    const current = session.current;
    if (!current?.active) return;
    current.refreshed = true;
    void load(current, true, !!video);
  }
  function observePosition(video: HTMLVideoElement, explicit = false) {
    const current = session.current;
    if (current && !current.loading && !current.resume && Number.isFinite(video.currentTime) && (video.currentTime > 0 || !video.error && (explicit || current.observed))) {
      current.position = video.currentTime;
      current.observed = true;
    }
  }
  return <div className="math-video-player">
    {video && <LearningVideo
      {...props}
      key={`${video.url}:${version}`}
      ref={element}
      src={video.url}
      poster={props.poster || video.poster}
      study={study}
      onSourceError={sourceFailed}
      onLoadedMetadata={event => {
        props.onLoadedMetadata?.(event);
        const current = session.current, resume = current?.resume;
        if (!current) return;
        if (!resume) { observePosition(event.currentTarget, true); return; }
        const duration = event.currentTarget.duration;
        if (resume.observed) event.currentTarget.currentTime = Math.max(0, Number.isFinite(duration) && duration > 0 ? Math.min(resume.position, duration) : resume.position);
        current.position = event.currentTarget.currentTime;
        current.observed = true;
        current.playing = resume.playing;
        current.resume = undefined;
        if (resume.playing) void event.currentTarget.play().catch(() => {});
      }}
      onPlay={event => {
        if (session.current) session.current.playing = true;
        props.onPlay?.(event);
      }}
      onPlaying={event => {
        if (session.current) session.current.playing = true;
        props.onPlaying?.(event);
      }}
      onTimeUpdate={event => {
        observePosition(event.currentTarget);
        props.onTimeUpdate?.(event);
      }}
      onSeeking={event => { observePosition(event.currentTarget, true); props.onSeeking?.(event); }}
      onSeeked={event => { observePosition(event.currentTarget, true); props.onSeeked?.(event); }}
      onPause={event => {
        const current = session.current;
        if (current && !current.loading && !current.resume && !event.currentTarget.error) current.playing = false;
        props.onPause?.(event);
      }}
      onEnded={event => {
        if (session.current) session.current.playing = false;
        props.onEnded?.(event);
      }}
    />}
    {loading && <p className="math-video-status" role="status"><LoaderCircle className="spin" size={16} />{video ? "正在更新播放地址…" : "正在加载视频…"}</p>}
    {error && <div className="math-video-status math-error-text"><p role="alert">{error}</p><button className="btn btn-secondary" onClick={retry} disabled={loading}>重试播放</button></div>}
  </div>;
});

export default MathVideoPlayer;
