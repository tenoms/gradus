import { studyFetch } from "../../lib/api";
import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Send, Trash2, Upload } from "lucide-react";
import { mathData } from "../../platforms/math";
import "./math-voice.css";

// The browser negotiates a supported format instead of labeling WebM bytes as MP3.
// https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static
export default function MathVoiceRecorder({
  onSend,
  label = "发送语音回复",
  disabled = false,
}: {
  onSend: (url: string) => Promise<void>;
  label?: string;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [uploaded, setUploaded] = useState("");
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      if (recorder.current) {
        recorder.current.ondataavailable = null;
        recorder.current.onstop = null;
        if (recorder.current.state !== "inactive") recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false);
  };
  const start = async () => {
    setError("");
    setUploaded("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("当前浏览器不能直接录音，你可以上传已有语音文件。");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const type = [
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const next = type
        ? new MediaRecorder(media, { mimeType: type })
        : new MediaRecorder(media);
      recorder.current = next;
      const chunks: Blob[] = [];
      next.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      next.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        const mime = next.mimeType || type || "audio/webm";
        const blob = new Blob(chunks, { type: mime });
        if (blob.size)
          setFile(
            new File(
              [blob],
              `math-answer-${Date.now()}.${mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm"}`,
              { type: mime },
            ),
          );
        else setError("录音没有采集到声音，请检查麦克风后重试。");
        setRecording(false);
      };
      next.onerror = () => {
        setError("录音中断，请检查麦克风后重试。");
        stop();
      };
      setFile(undefined);
      setSeconds(0);
      next.start();
      setRecording(true);
      let elapsed = 0;
      timer.current = setInterval(() => {
        elapsed++;
        setSeconds(elapsed);
        if (elapsed >= 60) stop();
      }, 1000);
    } catch (e: any) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        e.name === "NotAllowedError"
          ? "麦克风权限未开启，可以允许麦克风后重试，或上传已有语音。"
          : e.message || "无法打开麦克风",
      );
    }
  };
  const upload = async () => {
    if (!file) return;
    setSending(true);
    setError("");
    try {
      let url = uploaded;
      if (!url) {
        const form = new FormData();
        form.append("file", file);
        const response = await studyFetch(
          "/api/platform/math/upload?path=/api/sys_attachment/UpFile",
          { method: "POST", credentials: "same-origin", body: form },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "语音上传失败");
        const data = mathData(result);
        url = data?.Path || data?.src || data?.Url;
        if (!/^https?:\/\//i.test(url))
          throw new Error("平台未返回可播放的语音地址");
        setUploaded(url);
      }
      await onSend(url);
      setFile(undefined);
      setUploaded("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="math-voice-recorder">
      <div className="math-voice-heading">
        <Mic size={21} />
        <strong>
          {recording
            ? "正在录音"
            : file
              ? "试听后发送语音"
              : "录制一段清楚的语音解答"}
        </strong>
        <span>{recording ? `${seconds} / 60 秒` : "单段最长60秒"}</span>
      </div>
      {preview && <audio controls src={preview} preload="metadata" />}
      <div className="math-voice-actions">
        {recording ? (
          <button className="btn btn-primary" onClick={stop}>
            <Pause size={15} />
            结束录音
          </button>
        ) : (
          <button
            className="btn btn-secondary"
            disabled={disabled || sending}
            onClick={start}
          >
            <Mic size={15} />
            {file ? "重新录制" : "开始录音"}
          </button>
        )}
        <label className="btn btn-secondary math-voice-upload">
          <Upload size={15} />
          上传已有语音
          <input
            type="file"
            accept="audio/*"
            disabled={recording || disabled || sending}
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen && chosen.size > 15 * 1024 * 1024) {
                setError("请选择小于15 MB的语音文件");
                return;
              }
              setFile(chosen);
              setUploaded("");
              setError("");
            }}
          />
        </label>
        {file && (
          <>
            <button
              className="math-icon-button"
              aria-label="删除当前录音"
              disabled={sending}
              onClick={() => {
                setFile(undefined);
                setUploaded("");
              }}
            >
              <Trash2 size={16} />
            </button>
            <button
              className="btn btn-primary"
              disabled={disabled || sending}
              onClick={upload}
            >
              <Send size={15} />
              {sending ? "上传并保存中…" : label}
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="math-error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
