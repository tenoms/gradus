import { useDialogFocus } from "../../lib/focus";
import MathErrorRecords from "./MathErrorRecords";
import { useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Flag,
  MessageCircle,
  PencilLine,
  Star,
  X,
} from "lucide-react";
import MathNoteEditor from "./MathNoteEditor";
import MathDiscussion from "./MathDiscussion";
import { AttachmentInput } from "./MathQuestions";
import { mathPost } from "../../platforms/math";
import type { MathRow, NoteKind } from "../../platforms/math";
import { feedbackPayload } from "./discussion-model.mjs";
import "./MathDiscussion.css";
export default function MathQuestionTools({
  stuid,
  qid,
  bookId = 0,
  question,
  source = "电子书",
  isCourse = false,
}: {
  stuid: string;
  qid: string | number;
  bookId?: number;
  question?: MathRow;
  source?: string;
  isCourse?: boolean;
}) {
  const [kind, setKind] = useState<NoteKind>(),
    [discussion, setDiscussion] = useState(false);
  return (
    <div className="mqt-tools">
      <div className="mqt-actions">
        <button className="btn btn-secondary" onClick={() => setKind("错题")}>
          <BookOpen size={15} />
          加入错题
        </button>
        <button className="btn btn-secondary" onClick={() => setKind("收藏")}>
          <Star size={15} />
          收藏题目
        </button>
        <button className="btn btn-secondary" onClick={() => setKind("笔记")}>
          <PencilLine size={15} />
          记录笔记
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setDiscussion(!discussion)}
        >
          <MessageCircle size={15} />
          {discussion ? "收起讨论" : "题目讨论"}
        </button>
        <MathFeedbackButton
          stuid={stuid}
          qid={qid}
          bookId={bookId || Number(question?.BookID || 0)}
        />
      </div>
      {discussion && (
        <div className="panel mqt-discussion">
          <MathDiscussion stuid={stuid} qid={qid} />
        </div>
      )}
      {kind && (
        <MathNoteEditor
          stuid={stuid}
          qid={qid}
          bookId={bookId}
          kind={kind}
          source={source}
          isCourse={isCourse}
          close={() => setKind(undefined)}
        />
      )}
    </div>
  );
}
export function MathFeedbackButton({
  stuid,
  qid,
  bookId = 0,
  baseType = "题目",
  compact = false,
}: {
  stuid: string;
  qid: string | number;
  bookId?: number;
  baseType?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={compact ? "math-icon-button" : "btn btn-secondary"}
        aria-label="反馈错误"
        title="反馈错误"
        onClick={() => setOpen(true)}
      >
        <Flag size={15} />
        {!compact && "反馈错误"}
      </button>
      {open && (
        <FeedbackEditor
          stuid={stuid}
          qid={qid}
          bookId={bookId}
          initialType={baseType}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
function FeedbackEditor({
  stuid,
  qid,
  bookId,
  initialType,
  close,
}: {
  stuid: string;
  qid: string | number;
  bookId: number;
  initialType: string;
  close: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  const [tab, setTab] = useState<"submit" | "history">("submit");
  const [baseType, setBaseType] = useState(initialType),
    [types, setTypes] = useState<string[]>([]),
    [content, setContent] = useState(""),
    [images, setImages] = useState<string[]>([]),
    [answerImages, setAnswerImages] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const options =
    baseType === "视频解析"
      ? ["视频与题干不对应", "视频播放错误", "讲解错误", "其他（请补充）"]
      : baseType === "文字解析"
        ? [
            "有错别字",
            "有乱码",
            "图像错误",
            "题干或答案有误",
            "内容有误",
            "跳步严重",
            "逻辑混乱",
            "前后矛盾",
            "其他（请补充）",
          ]
        : ["题干有误", "答案有误", "解析有误", "有错别字", "其他（请补充）"];
  return (
    <div className="math-modal-backdrop" onClick={() => !busy && close()}>
      <section
        className="panel math-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="题目错误反馈"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.stopPropagation();
            close();
          }
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="math-modal-heading">
          <h3>让内容变得更准确</h3>
          <button
            className="icon-button"
            disabled={busy}
            aria-label="关闭错误反馈"
            onClick={close}
          >
            <X size={19} />
          </button>
        </div>
        <div className="tabs">
          <button
            className={tab === "submit" ? "active" : ""}
            onClick={() => setTab("submit")}
          >
            提交反馈
          </button>
          <button
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            已有反馈
          </button>
        </div>
        {tab === "history" ? (
          <MathErrorRecords stuid={stuid} qid={qid} />
        ) : saved ? (
          <div className="math-state">
            <Check size={31} />
            <h3>反馈已提交</h3>
            <p>你的说明与图片已同步给平台审核。</p>
            <button className="btn btn-primary" onClick={close}>
              完成
            </button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!types.length) {
                setError("请选择错误类型。");
                return;
              }
              if (content.trim().length < 5) {
                setError("请补充至少 5 个字的说明。");
                return;
              }
              if (!images.length) {
                setError("请添加标明错误位置的图片。");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await mathPost(
                  "/api/sys_give/Inner_sys_give",
                  feedbackPayload({
                    qid,
                    stuid,
                    bookId,
                    types,
                    content: content.trim(),
                    images,
                    answerImages,
                    baseType,
                  }),
                );
                setSaved(true);
              } catch (error: any) {
                setError(error.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field-label">
              反馈内容
              <select
                className="input"
                value={baseType}
                onChange={(e) => {
                  setBaseType(e.target.value);
                  setTypes([]);
                }}
              >
                {[
                  ...new Set([initialType, "题目", "文字解析", "视频解析"]),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <fieldset className="mqt-error-types">
              <legend>错误类型</legend>
              {options.map((option) => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={types.includes(option)}
                    onChange={() =>
                      setTypes((v) =>
                        v.includes(option)
                          ? v.filter((t) => t !== option)
                          : [...v, option],
                      )
                    }
                  />
                  {option}
                </label>
              ))}
            </fieldset>
            <label className="field-label">
              补充说明
              <textarea
                className="input"
                rows={4}
                placeholder="请具体说明错误位置与原因，至少 5 个字"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                minLength={5}
                maxLength={4000}
                required
              />
            </label>
            <p className="field-label">错误位置图片（必填）</p>
            <AttachmentInput value={images} onChange={setImages} max={5} />
            <p className="field-label">建议的正确解答图片（选填）</p>
            <AttachmentInput
              value={answerImages}
              onChange={setAnswerImages}
              max={5}
            />
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary full-width" disabled={busy}>
              {busy ? "正在提交…" : "提交错误反馈"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
