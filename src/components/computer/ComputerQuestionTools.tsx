import { useEffect, useRef, useState } from "react";
import { Flag, ImagePlus, LoaderCircle, Mic, Square, X } from "lucide-react";
import { computerUpload, safeLink } from "../../platforms/computer";
import type { ComputerRecord as R } from "../../platforms/computer";
import { computerLearningApi, computerVoiceAnswer } from "./computer-learning";
import { computerRecordingFormat, prepareComputerAudioFile } from "./computer-audio.mjs";

export default function ComputerQuestionTools({
  question,
  majorId,
  chapterId = "",
  examId = "",
  index,
  source,
  examCategory = 1,
  onRelated,
}: {
  question: R;
  majorId: string;
  chapterId?: string;
  examId?: string;
  index: number;
  source: string;
  examCategory?: number;
  onRelated: (data: R) => void;
}) {
  const [open, setOpen] = useState(false),
    [types, setTypes] = useState<number[]>([]),
    [detail, setDetail] = useState(""),
    [images, setImages] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [markedWrong,setMarkedWrong] = useState(Number(question.incorrectNumber)>0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function toggleMistake() {
    setBusy(true);setError("");
    try {
      await computerLearningApi.markMistake(question,majorId,chapterId,examCategory,markedWrong);
      setMarkedWrong(!markedWrong);setNotice(markedWrong?"已从错题本移除":"已加入错题本");
    } catch(error:any) {setError(error.message);} finally {setBusy(false);}
  }
  async function share() {
    setError("");
    try {
      const url = new URL("/study/question-bank", window.location.origin);
      url.searchParams.set(
        "exerciseId",
        String(question.exerciseId || question.id),
      );
      await navigator.clipboard.writeText(url.href);
      setNotice("题目链接已复制");
    } catch {
      setError("链接复制失败，请允许浏览器访问剪贴板后重试。");
    }
  }
  async function related() {
    setBusy(true);
    setError("");
    try {
      onRelated(
        await computerLearningApi.related(
          question,
          majorId,
          chapterId,
          examCategory,
        ),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files).slice(0, 4 - images.length)) {
        const data = await computerUpload(file),
          url = data.previewUrl || data.url;
        if (!url) throw new Error("上传服务没有返回图片地址");
        setImages((a) => [...a, url]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!types.length) throw new Error("请至少选择一种错误类型");
      if (!detail.trim()) throw new Error("请填写详细纠错内容");
      await computerLearningApi.feedback({
        exerciseId: question.exerciseId || question.id,
        majorId: question.majorId || majorId,
        examId,
        exerciseSort: index + 1,
        source,
        pictureAdd: images.join(","),
        errorDetail: detail,
        errorType: types.join(","),
      });
      setOpen(false);
      setNotice("纠错已提交，感谢反馈。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="computer-question-tools">
      <div className="computer-toolbar">
        <button className="btn btn-secondary" disabled={busy} onClick={()=>void toggleMistake()}>{markedWrong?"移出错题本":"加入错题本"}</button>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void related()}
        >
          同章节同类练习
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setOpen(!open);
            setError("");
          }}
        >
          <Flag size={15} />
          题目纠错
        </button>
        <button className="btn btn-secondary" onClick={() => void share()}>
          复制题目链接
        </button>
      </div>
      {notice && (
        <p className="computer-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="computer-error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <div className="computer-tool-form">
          <h3>反馈题目问题</h3>
          <div className="computer-toolbar">
            {[
              [1, "题干错误"],
              [2, "答案错误"],
              [3, "解析错误"],
              [5, "题目超纲"],
              [4, "其他"],
            ].map(([id, title]) => (
              <button
                className={`btn btn-secondary ${types.includes(Number(id)) ? "selected" : ""}`}
                key={id}
                onClick={() =>
                  setTypes((t) =>
                    t.includes(Number(id))
                      ? t.filter((v) => v !== id)
                      : [...t, Number(id)],
                  )
                }
              >
                {title}
              </button>
            ))}
          </div>
          <textarea
            className="input"
            aria-label="题目纠错详情"
            rows={4}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="说明问题所在，方便核对修正"
          />
          <div className="computer-tool-images">
            {images.map((url, i) => (
              <div key={i}>
                {safeLink(url) && (
                  <a href={safeLink(url)} target="_blank" rel="noreferrer">
                    <img src={safeLink(url)} alt={`纠错附件 ${i + 1}`} />
                  </a>
                )}
                <button
                  className="computer-icon"
                  aria-label={`移除附件 ${i + 1}`}
                  onClick={() => setImages((a) => a.filter((_, j) => j !== i))}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="computer-toolbar">
            <label className="btn btn-secondary computer-upload">
              <ImagePlus size={15} />
              添加图片（{images.length}/4）
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={busy || images.length >= 4}
                onChange={(e) => void upload(e.target.files)}
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={busy || !types.length || !detail.trim()}
              onClick={() => void submit()}
            >
              {busy ? <LoaderCircle size={15} className="spin" /> : null}
              提交纠错
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setOpen(false)}
            >
              收起
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ComputerInterviewRecorder({
  disabled,
  value = "",
  onAnswer,
}: {
  disabled?: boolean;
  value?: string;
  onAnswer: (answer: string) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<BlobPart[]>([]),
    startAt = useRef(0),
    [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [seconds, setSeconds] = useState(0),
    [url, setUrl] = useState(value.split("$-$")[0] || ""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - startAt.current) / 1000)),
      250,
    );
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function begin() {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error("当前浏览器不支持录音，可上传已有录音文件。");
      const format = computerRecordingFormat((type) => MediaRecorder.isTypeSupported(type));
      if (!format) throw new Error("当前浏览器无法录制平台支持的音频，请上传已有的 MP3 或 MP4 录音。");
      const source = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = source;
      const active = new MediaRecorder(source, { mimeType: format.mimeType });
      recorder.current = active;
      chunks.current = [];
      active.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      active.onstop = () => {
        source.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const duration = Math.max(0.001, (Date.now() - startAt.current) / 1000),
          file = new File(
            chunks.current,
            `interview-${Date.now()}.${format.extension}`,
            { type: active.mimeType || format.mimeType },
          );
        void saveAudio(file, duration);
      };
      active.start();
      startAt.current = Date.now();
      setSeconds(0);
      setRecording(true);
    } catch (e: any) {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setError(
        e.name === "NotAllowedError"
          ? "请在浏览器中允许麦克风后重试，或上传录音文件。"
          : e.message,
      );
    }
  }
  async function saveAudio(file: File, duration: number) {
    setBusy(true);
    setError("");
    try {
      const upload = await prepareComputerAudioFile(file),
        data = await computerUpload(upload),
        audioUrl = safeLink(data.previewUrl || data.url);
      if (!audioUrl) throw new Error("平台未返回可播放的录音地址，请改用 MP3 或 MP4 录音文件。");
      setUrl(audioUrl);
      onAnswer(computerVoiceAnswer(audioUrl, duration));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="computer-audio-answer">
      <h3>复试口头作答</h3>
      <p className="computer-dim">
        录制回答并上传后，再提交本题。录音时长会随答案保存。
      </p>
      <div className="computer-toolbar">
        {recording ? (
          <button
            className="btn btn-primary"
            onClick={() => recorder.current?.stop()}
          >
            <Square size={15} />
            结束录音 · {seconds} 秒
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={disabled || busy}
            onClick={() => void begin()}
          >
            <Mic size={15} />
            开始录音
          </button>
        )}
        <label className="btn btn-secondary computer-upload">
          上传已有录音
          <input
            type="file"
            accept=".mp3,.mp4,.m4a,audio/mpeg,audio/mp4"
            disabled={disabled || busy || recording}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const audio = document.createElement("audio"),
                objectUrl = URL.createObjectURL(file);
              audio.onloadedmetadata = () => {
                const duration = audio.duration;
                URL.revokeObjectURL(objectUrl);
                if (Number.isFinite(duration)) void saveAudio(file, duration);
                else setError("无法识别录音时长，请换一个音频文件。");
              };
              audio.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                setError("无法读取这个音频文件");
              };
              audio.src = objectUrl;
            }}
          />
        </label>
      </div>
      {busy && <p role="status">正在上传录音…</p>}
      {url && safeLink(url) && <audio controls src={safeLink(url)} />}{" "}
      {error && (
        <p className="computer-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
