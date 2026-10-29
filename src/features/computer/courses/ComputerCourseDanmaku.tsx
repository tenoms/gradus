import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import {
  Clock3,
  Eye,
  EyeOff,
  LoaderCircle,
  MessageCircle,
  Send,
} from "lucide-react";
import { platformRequest } from "../../../shared/api/client";
import type { ComputerRecord } from "../api/computer";
import {
  activeDanmaku,
  courseDanmakuPayload,
  danmakuTime,
  lessonDanmaku,
  sendCourseDanmaku,
} from "./course-danmaku-model.mjs";
import type { CourseDanmaku } from "./course-danmaku-model.mjs";
import "./ComputerCourseDanmaku.css";

export default function ComputerCourseDanmaku({
  lesson,
  videoRef,
}: {
  lesson: ComputerRecord;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const base = useMemo(
    () => lessonDanmaku(lesson),
    [lesson.id, lesson.lessonBulletComments],
  );
  const [own, setOwn] = useState<CourseDanmaku[]>([]),
    [time, setTime] = useState(0),
    [paused, setPaused] = useState(true),
    [rate, setRate] = useState(1),
    [started, setStarted] = useState(false),
    [ready, setReady] = useState(false),
    [host, setHost] = useState<HTMLElement | null>(null),
    [visible, setVisible] = useState(true),
    [message, setMessage] = useState(""),
    [sending, setSending] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    setOwn([]);
    setMessage("");
    setNotice("");
    setError("");
    setStarted(false);
    const video = videoRef.current;
    if (!video) {
      setHost(null);
      setReady(false);
      return;
    }
    const parent = video.parentElement;
    parent?.classList.add("ccd-video-host");
    setHost(parent);
    const update = () => {
      setTime(Number(video.currentTime) || 0);
      setPaused(video.paused);
      setRate(video.playbackRate || 1);
      setReady(video.readyState >= 1);
      if (!video.paused || video.played.length > 0) setStarted(true);
    };
    const play = () => {
      setStarted(true);
      update();
    };
    update();
    for (const event of [
      "timeupdate",
      "loadedmetadata",
      "seeked",
      "pause",
      "ended",
      "ratechange",
    ])
      video.addEventListener(event, update);
    video.addEventListener("play", play);
    return () => {
      for (const event of [
        "timeupdate",
        "loadedmetadata",
        "seeked",
        "pause",
        "ended",
        "ratechange",
      ])
        video.removeEventListener(event, update);
      video.removeEventListener("play", play);
      parent?.classList.remove("ccd-video-host");
    };
  }, [lesson.id, videoRef]);
  const rows = useMemo(
      () =>
        [...base, ...own].sort((a, b) => a.time - b.time || a.index - b.index),
      [base, own],
    ),
    active = activeDanmaku(rows, time);
  const seek = (position: number) => {
    const video = videoRef.current;
    if (!video || video.readyState < 1) {
      setError("视频仍在加载，请稍后定位");
      return;
    }
    setError("");
    video.currentTime = Number.isFinite(video.duration)
      ? Math.min(position, video.duration)
      : position;
    setTime(video.currentTime);
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setNotice("");
    setError("");
    try {
      const video = videoRef.current,
        payload = courseDanmakuPayload(
          lesson,
          message,
          video?.currentTime ?? NaN,
          started,
        );
      await sendCourseDanmaku(platformRequest, payload);
      setOwn((old) => [
        ...old,
        {
          key: `own-${Date.now()}`,
          text: payload.bulletComments,
          time: Math.floor(payload.releaseTime),
          index: base.length + old.length,
        },
      ]);
      setMessage("");
      setNotice(`弹幕已发送至 ${danmakuTime(payload.releaseTime)}。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="ccd-danmaku" aria-label="课时定时弹幕">
      <div className="ccd-heading">
        <h4>
          <MessageCircle size={16} />
          课时弹幕 <span>{rows.length}</span>
        </h4>
        <button
          className="ccd-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
        >
          {visible ? <Eye size={14} /> : <EyeOff size={14} />}画面弹幕
          {visible ? "已开" : "已关"}
        </button>
      </div>
      <form className="ccd-form" onSubmit={send}>
        <span className="ccd-position">
          <Clock3 size={13} />
          {danmakuTime(time)}
        </span>
        <input
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={20}
          aria-label="发送课时弹幕"
          placeholder={
            started
              ? "在当前时间留下学习想法（最多20字）"
              : "播放课时后可发送弹幕"
          }
          disabled={sending}
        />
        <button
          className="btn btn-secondary"
          disabled={sending || !started || !message.trim()}
        >
          {sending ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Send size={14} />
          )}
          发送
        </button>
      </form>
      {notice && (
        <p className="ccd-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="ccd-error" role="alert">
          {error}
        </p>
      )}
      <details className="ccd-list" open>
        <summary>
          按时间查看全部弹幕 <small>点击时间定位</small>
        </summary>
        {rows.length ? (
          <ol>
            {rows.map((row) => (
              <li
                key={row.key}
                className={Math.abs(row.time - time) <= 0.5 ? "active" : ""}
              >
                <button
                  disabled={!ready}
                  onClick={() => seek(row.time)}
                  aria-label={`定位到 ${danmakuTime(row.time)}`}
                >
                  <time>{danmakuTime(row.time)}</time>
                  <span>{row.text}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ccd-empty">
            当前课时还没有弹幕，开始播放后可留下第一条学习想法。
          </p>
        )}
      </details>
      {host &&
        visible &&
        createPortal(
          <div className="ccd-overlay" aria-hidden="true">
            {active.map((row) => (
              <span
                key={row.key}
                style={{
                  top: `${12 + (row.index % 4) * 19}%`,
                  animationPlayState: paused ? "paused" : "running",
                  animationDuration: `${6 / rate}s`,
                }}
              >
                {row.text}
              </span>
            ))}
          </div>,
          host,
        )}
    </section>
  );
}
