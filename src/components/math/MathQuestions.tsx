import { studyFetch } from "../../lib/api";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileImage,
  GraduationCap,
  HelpCircle,
  LoaderCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Star,
  X,
} from "lucide-react";
import RichContent from "../RichContent";
import {
  mathApi,
  mathFreshCommand as mathCommand,
  mathData,
  mathGet,
  mathPost,
  mathQuestionId,
  mathRows,
  mathTitle,
} from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import "./MathQuestions.css";
import MathQAReport from "./MathQAReport";
import MathVoiceRecorder from "./MathVoiceRecorder";
import {
  normalizeMathQuestionOrder,
  qaTeacherRights,
  qaVoicePayload,
} from "../../platforms/math-qa";

const station = 1;
const stateNames: Record<string, string> = {
  "0": "等待解答",
  "1": "老师解答中",
  "2": "已解答，可追问",
  "3": "已完成",
  "4": "已完成",
  "-1": "未受理",
};
function useData(key: string, load: () => Promise<any>) {
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(undefined);
    setError("");
    load()
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message || "数学平台暂时无法读取答疑");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, version]);
  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
}
function RequestState({
  loading,
  error,
  empty,
  reload,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  reload?: () => void;
}) {
  if (loading)
    return (
      <div className="math-state">
        <LoaderCircle className="spin" size={23} />
        <p>正在读取答疑内容…</p>
      </div>
    );
  if (error)
    return (
      <div className="math-state math-error">
        <p>{error}</p>
        {reload && (
          <button className="btn btn-secondary" onClick={reload}>
            重新加载
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="math-state">
        <HelpCircle size={29} />
        <p>这个分类还没有答疑记录</p>
        <small>遇到不理解的题目时，可以带着你的思考发起提问。</small>
      </div>
    );
  return null;
}
function date(value: unknown) {
  return String(value || "")
    .replace("T", " ")
    .slice(0, 16);
}
function stamp() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });
}
function failure(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
function urls(value: unknown) {
  return typeof value === "string"
    ? value
        .split(/[,;]/)
        .map((v) => v.trim())
        .filter((v) => /^https?:\/\//i.test(v))
    : [];
}
function Files({ value, audio }: { value: unknown; audio?: boolean }) {
  return (
    <div className="math-qa-files">
      {urls(value).map((url, i) =>
        audio || /\.(mp3|m4a|aac|wav|ogg|amr)(\?|$)/i.test(url) ? (
          <audio key={i} controls src={url} preload="metadata" />
        ) : /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url) ? (
          <a key={i} href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={`答疑附件 ${i + 1}`} loading="lazy" />
          </a>
        ) : (
          <a
            className="math-file-link"
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <FileImage size={16} />
            打开附件 {i + 1}
          </a>
        ),
      )}
    </div>
  );
}
export async function uploadMathAttachment(file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await studyFetch(
    "/api/platform/math/upload?path=/api/sys_attachment/LayuiUpImg",
    { method: "POST", credentials: "same-origin", body: form },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result?.error || result?.message || "附件上传失败");
  let data = mathData(result);
  if (Array.isArray(data)) data = data[0];
  const path =
    data?.src ||
    data?.Path ||
    data?.Url ||
    data?.url ||
    result?.src ||
    (typeof data === "string" ? data : "");
  if (!/^https?:\/\//i.test(path))
    throw new Error("平台未返回可用的附件地址，请重新上传");
  return String(path);
}
export function AttachmentInput({
  value,
  onChange,
  max = 9,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    setError("");
    const all = [...value];
    try {
      for (const file of [...files].slice(0, max - value.length)) {
        if (file.size > 15 * 1024 * 1024)
          throw new Error("每张图片请控制在15 MB以内");
        all.push(await uploadMathAttachment(file));
        onChange([...all]);
      }
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="math-qa-attachments">
      {value.map((url, i) => (
        <div key={`${url}-${i}`}>
          <img src={url} alt={`已上传附件 ${i + 1}`} />
          <button
            type="button"
            aria-label={`移除附件${i + 1}`}
            onClick={() => onChange(value.filter((_, n) => n !== i))}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {value.length < max && (
        <label className="math-qa-attach-button">
          <FileImage size={18} />
          <span>{busy ? "上传中…" : "添加图片"}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => upload(e.target.files)}
            aria-label="上传答疑图片附件"
          />
        </label>
      )}
      {error && <p className="math-error-text">{error}</p>}
    </div>
  );
}

export default function MathQuestions({
  stuid,
  userId,
  onQuestion,
  initialOrder,
}: {
  stuid: string;
  userId?: number;
  onQuestion?: (row: MathRow) => void;
  initialOrder?: MathRow;
}) {
  const [state, setState] = useState("0");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [current, setCurrent] = useState<MathRow | undefined>(initialOrder);
  const [newShown, setNewShown] = useState(false);
  const [teacherShown, setTeacherShown] = useState(false);
  const teacher = useData(`qa-teacher-${userId}`, () =>
    userId
      ? mathCommand("CheckUserIsQuestionTeacher", {
          UserID: userId,
          System_Station_ID: station,
        })
      : Promise.resolve({ data: [] }),
  );
  const teacherAccounts = mathRows(teacher.data).filter(
    (t) => t.TeacherID,
  );
  const teacherInfo = teacherAccounts[0];
  const remote = useData(`qa-${stuid}-${state}-${page}`, () =>
    mathCommand("GetUserQuestionOrderList", {
      StuID: stuid,
      State: state,
      System_Station_ID: station,
      Page: page * 30,
      PageSize: 30,
    }),
  );
  const rows = mathRows(remote.data)
    .map(normalizeMathQuestionOrder)
    .filter(
      (r) =>
        !search ||
        [r.Title, r.Name, r.BookName, r.QuestionID].join(" ").includes(search),
    );
  const [reportShown, setReportShown] = useState(false);
  if (teacherShown && teacherInfo)
    return (
      <TeacherDesk
        teachers={teacherAccounts}
        stuid={stuid}
        back={() => setTeacherShown(false)}
      />
    );
  if (current)
    return (
      <QuestionOrder
        row={current}
        stuid={stuid}
        back={() => {
          setCurrent(undefined);
          remote.reload();
        }}
      />
    );
  if (reportShown)
    return (
      <MathQAReport
        stuid={stuid}
        back={() => setReportShown(false)}
        onOrder={setCurrent}
        onQuestion={onQuestion}
      />
    );
  return (
    <div className="math-workspace">
      <div className="math-qa-heading">
        <div>
          <span className="eyebrow">ASK & UNDERSTAND</span>
          <h2>把不懂的地方，真正弄明白</h2>
          <p>围绕数学题目发起学习答疑，查看老师的解答与追问。</p>
        </div>
        <div>
          <button
            className="btn btn-secondary"
            onClick={() => setReportShown(true)}
          >
            答疑统计
          </button>
          {teacherInfo && (
            <button
              className="btn btn-secondary"
              onClick={() => setTeacherShown(true)}
            >
              <GraduationCap size={16} />
              答疑工作台
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setNewShown(true)}>
            <Plus size={16} />
            发起提问
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="math-toolbar">
          <div className="tabs">
            {[
              ["0", "待解答"],
              ["1,2", "答疑中"],
              ["3,4", "已完成"],
              ["-1", "未受理"],
            ].map(([value, title]) => (
              <button
                key={value}
                className={value === state ? "active" : ""}
                onClick={() => {
                  setState(value);
                  setPage(0);
                }}
              >
                {title}
              </button>
            ))}
          </div>
          <label className="math-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索本页提问、书名…"
              aria-label="搜索答疑记录"
            />
          </label>
          <button
            className="math-icon-button"
            onClick={remote.reload}
            aria-label="刷新答疑列表"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <RequestState
          loading={remote.loading}
          error={remote.error}
          empty={!remote.loading && !remote.error && !rows.length}
          reload={remote.reload}
        />
        <OrderList rows={rows} open={setCurrent} />
        <div className="math-qa-pagination">
          <button
            className="btn btn-secondary"
            disabled={!page || remote.loading}
            onClick={() => setPage((v) => v - 1)}
          >
            上一页
          </button>
          <span>第 {page + 1} 页</span>
          <button
            className="btn btn-secondary"
            disabled={mathRows(remote.data).length < 30 || remote.loading}
            onClick={() => setPage((v) => v + 1)}
          >
            下一页
          </button>
        </div>
      </div>
      {newShown && (
        <NewMathQuestion
          stuid={stuid}
          close={() => setNewShown(false)}
          saved={() => {
            setNewShown(false);
            setState("0");
            setPage(0);
            remote.reload();
          }}
        />
      )}
    </div>
  );
}
function OrderList({
  rows,
  open,
}: {
  rows: MathRow[];
  open: (r: MathRow) => void;
}) {
  return (
    <div className="math-content-list math-qa-list">
      {rows.map((r, i) => (
        <button key={r.ID || i} onClick={() => open(r)}>
          <div className="math-list-icon">
            <MessageSquare size={20} />
          </div>
          <span>
            <span className="math-tag">
              {stateNames[String(r.State)] || "学习答疑"}
            </span>
            <strong>{r.Title || `第 ${r.QuestionID} 题的疑问`}</strong>
            <small>
              {r.BookName || r.Name || "数学题目"} ·{" "}
              {date(r.AddTime || r.UpdateTime)}
            </small>
          </span>
          <ChevronRight size={18} />
        </button>
      ))}
    </div>
  );
}

export function NewMathQuestion({
  stuid,
  question,
  close,
  saved,
}: {
  stuid: string;
  question?: MathRow;
  close: () => void;
  saved: () => void;
}) {
  const [chosen, setChosen] = useState<MathRow | undefined>(question);
  const [bookId, setBookId] = useState("");
  const [page, setPage] = useState("");
  const [number, setNumber] = useState("");
  const [results, setResults] = useState<MathRow[]>();
  const [title, setTitle] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const books = useData(`qa-books`, () =>
    question ? Promise.resolve({ data: [] }) : mathApi.books(),
  );
  const selectedBook = mathRows(books.data).find(
    (b) => String(b.ID) === bookId,
  );
  const isTruePaper =
    question?._book_list?.BusType === "试卷" ||
    question?.BookType === "试卷" ||
    selectedBook?.BusType === "试卷";
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setResults(
        mathRows(
          await mathApi.search(
            {
              BookID: bookId,
              QuestionPage: page,
              QuestionSort: number,
              QuestionID: "",
            },
            selectedBook?.BusType === "试卷",
          ),
        ),
      );
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!chosen || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await mathPost(
        "/api/question_orders/Inner_question_orders",
        {
          Title: title.trim(),
          Files: images.join(","),
          QuestionID: mathQuestionId(chosen),
          BkID: chosen.BookID || bookId || question?.BookID,
          StuID: stuid,
          State: 0,
          System_Station_ID: station,
          IsValid: 1,
          Tags: isTruePaper ? "真题" : "会员",
        },
      );
      if (result?.msg && result.msg !== "操作成功") throw new Error(result.msg);
      setSuccess(true);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="math-modal-backdrop" onClick={close}>
      <section
        className="math-modal math-qa-modal panel"
        role="dialog"
        aria-modal="true"
        aria-label="发起数学答疑"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="math-modal-heading">
          <h3>发起数学答疑</h3>
          <button
            className="math-icon-button"
            onClick={close}
            aria-label="关闭提问窗口"
          >
            <X size={20} />
          </button>
        </div>
        {success ? (
          <div className="math-state">
            <Check size={32} />
            <h3>提问已提交</h3>
            <p>老师的解答会同步到你的答疑记录，稍后可以在这里查看。</p>
            <button className="btn btn-primary" onClick={saved}>
              查看我的提问
            </button>
          </div>
        ) : (
          <>
            {chosen ? (
              <div className="math-qa-selected">
                <FileImage size={19} />
                <div>
                  <strong>
                    {chosen.BookName || chosen.Name || "数学题目"}
                  </strong>
                  <small>
                    第 {chosen.QuestionPage || "—"} 页 · 第{" "}
                    {chosen.QuestionSort || chosen.QuestionID || chosen.ID} 题
                  </small>
                </div>
                {!question && (
                  <button
                    className="math-text-button"
                    onClick={() => setChosen(undefined)}
                  >
                    重新选题
                  </button>
                )}
              </div>
            ) : (
              <div className="math-qa-select">
                <p>先选择你想提问的数学题目</p>
                <RequestState
                  loading={books.loading}
                  error={books.error}
                  reload={books.reload}
                />
                <form onSubmit={search}>
                  <select
                    className="input"
                    aria-label="答疑书籍"
                    required
                    value={bookId}
                    onChange={(e) => setBookId(e.target.value)}
                  >
                    <option value="">选择教辅或真题</option>
                    {mathRows(books.data).map((b, i) => (
                      <option key={b.ID || i} value={b.ID}>
                        {mathTitle(b)}
                      </option>
                    ))}
                  </select>
                  <div className="math-page-search">
                    <input
                      className="input"
                      placeholder="页码"
                      value={page}
                      onChange={(e) => setPage(e.target.value)}
                      aria-label="答疑题目页码"
                    />
                    <input
                      className="input"
                      placeholder="题号"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      aria-label="答疑题目题号"
                    />
                    <button
                      className="btn btn-secondary"
                      disabled={busy || !bookId || !(page || number)}
                    >
                      <Search size={15} />
                      查找题目
                    </button>
                  </div>
                </form>
                {results && (
                  <div className="math-qa-search-results">
                    {results.map((r, i) => (
                      <button
                        key={r.QuestionID || i}
                        onClick={() => setChosen(r)}
                      >
                        第 {r.QuestionPage || "—"} 页 · 第{" "}
                        {r.QuestionSort || r.QuestionID} 题
                        <ChevronRight size={15} />
                      </button>
                    ))}
                    {!results.length && (
                      <p>没有匹配到题目，请核对页码与题号。</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <label className="math-field">
              具体哪里不理解？
              <textarea
                className="input"
                maxLength={249}
                rows={5}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="描述你的解题思路，以及卡住的步骤，便于老师有针对性地解答。"
              />
            </label>
            <span className="math-qa-character-count">
              {title.length} / 249
            </span>
            <AttachmentInput value={images} onChange={setImages} />
            {error && (
              <p className="math-error-text" role="alert">
                {error}
              </p>
            )}
            <div className="math-modal-actions">
              <button className="btn btn-secondary" onClick={close}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={
                  busy ||
                  !chosen ||
                  !title.trim()
                }
              >
                {busy ? "提交中…" : "提交学习答疑"}
                <Send size={15} />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function QuestionOrder({
  row: sourceRow,
  stuid,
  teacher,
  back,
}: {
  row: MathRow;
  stuid: string;
  teacher?: MathRow;
  back: () => void;
}) {
  const row = normalizeMathQuestionOrder(sourceRow);
  const qid = row.QuestionID;
  const orderId = row.ID || row.OrderID;
  const remote = useData(`order-${orderId}`, () =>
    mathCommand(
      teacher ? "GetQuestionOrderNewInfoByID" : "GetQuestionOrderInfo",
      {
        QuestionID: qid,
        ID: orderId,
        StuID: stuid,
        System_Station_ID: station,
      },
    ),
  );
  const comments = useData(`order-comments-${orderId}`, () =>
    mathCommand("GetQuestionOrderCommentList", {
      QuestionID: qid,
      OrderID: orderId,
      System_Station_ID: station,
    }),
  );
  const levels = useData(`order-levels-${orderId}`, () =>
    mathCommand(
      teacher
        ? "GetUserQuestionOrderLevelOfTeacher"
        : "GetUserQuestionOrderLevel",
      {
        QuestionID: qid,
        OrderID: orderId,
        ...(teacher ? {} : { StuID: stuid }),
        System_Station_ID: station,
      },
    ),
  );
  const info = normalizeMathQuestionOrder(mathRows(remote.data)[0] || row);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState("");
  const [rating, setRating] = useState("3");
  const [tag, setTag] = useState("思路清晰");
  const [sameQuestion, setSameQuestion] = useState(false);
  const refresh = () => {
    remote.reload();
    comments.reload();
    levels.reload();
  };
  const run = async (fn: () => Promise<any>, message: string) => {
    if (teacher && !teacherMayWrite) {
      setError("此提问已由其他老师受理，当前仅可查看。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setText("");
      setImages([]);
      setAction("");
      setNotice(message);
      refresh();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  const followup = () =>
    run(
      async () => {
        if (teacher) {
          const unread = mathRows(comments.data)
            .filter((c) => Number(c.Notes) === 0)
            .map((c) => c.ID);
          if (unread.length)
            await mathPost("/api/question_order_comments/UpdateNotes", {
              Notes: 1,
              UpdateIds: unread.join(","),
            });
        }
        return mathPost(
          "/api/question_order_comments/Inner_question_order_comments",
          {
            BusType: images.length ? "图文" : "文字",
            BusValue: text.trim(),
            BusUrl: images.join(","),
            BusID: orderId,
            QuestionID: qid,
            Notes: teacher ? 1 : 0,
            ...(teacher ? { TeacherID: teacher.TeacherID } : { StuID: stuid }),
            System_Station_ID: station,
          },
        );
      },
      teacher ? "回复已保存" : "追问已提交",
    );
  const evaluate = () =>
    run(async () => {
      await mathPost("/api/question_order_level/Inner_question_order_level", {
        QuestionID: qid,
        TeacherID: info.TeacherID,
        StuID: stuid,
        Context: text.trim(),
        Notes: tag,
        BusID: Number(rating),
        Json: orderId,
        IsValid: 1,
        System_Station_ID: station,
      });
      await mathPost("/api/question_orders/Inner_question_orders", {
        ID: orderId,
        State: 4,
        UpdateColumns: "ID,State",
      });
    }, "评价已保存，答疑已完成");
  const updateOrder = (changes: MathRow, message: string) =>
    run(
      () =>
        mathPost("/api/question_orders/Inner_question_orders", {
          ID: orderId,
          TeacherID: teacher?.TeacherID,
          ...changes,
          UpdateTime: stamp(),
          UpdateColumns: [
            "ID",
            ...Object.keys(changes),
            ...(teacher ? ["TeacherID"] : []),
            "UpdateTime",
          ].join(","),
        }),
      message,
    );
  const doAccept = () =>
    run(async () => {
      const work = mathRows(
        await mathCommand("GetQuestionTeacherWorkToday", {
          TeacherID: teacher?.TeacherID,
          System_Station_ID: station,
        }),
      );
      if (
        !work.some(
          (w) => w.StartTime && !/^(1900|0001)/.test(String(w.StartTime)),
        )
      )
        throw new Error("请先在当前排班中完成上班打卡，再接受新提问");
      const count = mathRows(
        await mathCommand("GetTeacherWaitAnswerCounts", {
          TeacherID: teacher?.TeacherID,
          System_Station_ID: station,
        }),
      )[0];
      if (Number(count?.WaitAnswerCounts) > 0)
        throw new Error("请先完成正在解答的问题，再接受新提问");
      await mathPost("/api/question_orders/Inner_question_orders", {
        ID: orderId,
        TeacherID: teacher?.TeacherID,
        State: 1,
        Context: stamp(),
        UpdateColumns: "ID,State,TeacherID,Context",
      });
    }, "已接受提问，可以开始解答");
  const rights = qaTeacherRights(info, teacher, !!row._previewOnly);
  const teacherOwns = rights.owns;
  const teacherUnassigned = rights.unassigned;
  const teacherMayWrite = rights.write;
  const teacherMayEditAnswer = rights.editAnswer;
  const teacherMayFollow = rights.follow;
  const sendVoice = async (url: string, isAnswer: boolean) => {
    if (!teacherOwns || !teacher || (!isAnswer && !teacherMayFollow))
      throw new Error("当前答疑已不允许回复，请刷新后核对处理状态。");
    setBusy(true);
    try {
      if (isAnswer) {
        await mathPost(
          "/api/question_orders/Inner_question_orders",
          qaVoicePayload({
            orderId,
            questionId: qid,
            teacherId: teacher.TeacherID,
            url,
            isAnswer: true,
            at: stamp(),
          }),
        );
      } else {
        const unread = mathRows(comments.data)
          .filter((c) => Number(c.Notes) === 0)
          .map((c) => c.ID);
        if (unread.length)
          await mathPost("/api/question_order_comments/UpdateNotes", {
            Notes: 1,
            UpdateIds: unread.join(","),
          });
        await mathPost(
          "/api/question_order_comments/Inner_question_order_comments",
          qaVoicePayload({
            orderId,
            questionId: qid,
            teacherId: teacher.TeacherID,
            url,
            isAnswer: false,
            at: stamp(),
          }),
        );
      }
      setAction("");
      setNotice("语音解答已同步到数学平台");
      refresh();
    } finally {
      setBusy(false);
    }
  };
  if (sameQuestion && teacher)
    return (
      <SameQuestionHistory
        stuid={stuid}
        teacher={teacher}
        qid={qid}
        back={() => setSameQuestion(false)}
      />
    );
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={16} />
        返回答疑列表
      </button>
      <div className="math-qa-heading">
        <div>
          <span className="eyebrow">QUESTION #{qid}</span>
          <h2>{info.Name || info.BookName || "数学学习答疑"}</h2>
          <p>
            第 {info.QuestionPage || "—"} 页 ·{" "}
            {stateNames[String(info.State)] || "学习答疑"} ·{" "}
            {date(info.AddTime)}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={refresh}>
          <RefreshCw size={15} />
          刷新解答
        </button>
      </div>
      <div className="panel math-qa-thread">
        <RequestState
          loading={remote.loading}
          error={remote.error}
          reload={remote.reload}
        />
        <article className="math-qa-bubble">
          <div className="math-qa-bubble-person">
            <UserIcon value={info.UserAvatar || info.UserNick} />
            <strong>{info.UserNick || "我的提问"}</strong>
            <time>{date(info.AddTime)}</time>
          </div>
          <RichContent content={info.Title} />
          <Files value={info.Files} />
        </article>
        {info.TeacherID && (
          <article className="math-qa-bubble teacher">
            <div className="math-qa-bubble-person">
              <GraduationCap size={22} />
              <strong>{info.TeacherName || "答疑老师"}</strong>
              <time>{date(info.UpdateTime)}</time>
            </div>
            <RichContent
              content={info.BaseContent || "问题已收到，老师正在解答。"}
            />
            <Files
              value={info.BasFiles}
              audio={info.BaseContent === "语音回答："}
            />
          </article>
        )}
        <RequestState
          loading={comments.loading}
          error={comments.error}
          reload={comments.reload}
        />
        {mathRows(comments.data).map((c, i) => (
          <article
            className={`math-qa-bubble ${c.TeacherID ? "teacher" : ""}`}
            key={c.ID || i}
          >
            <div className="math-qa-bubble-person">
              {c.TeacherID ? (
                <GraduationCap size={20} />
              ) : (
                <MessageSquare size={20} />
              )}
              <strong>
                {c.TeacherID ? info.TeacherName || "老师回复" : "我的追问"}
              </strong>
              <time>{date(c.AddTime)}</time>
            </div>
            {c.BusType === "语音" ? (
              <Files value={c.BusValue} audio />
            ) : (
              <>
                <RichContent content={c.BusValue || c.Context} />
                <Files value={c.BusUrl} />
              </>
            )}
            {teacherMayWrite &&
              teacherOwns &&
              String(c.TeacherID) === String(teacher?.TeacherID) && (
                <button
                  className="math-text-button"
                  disabled={busy}
                  onClick={() => setAction(`retract-${c.ID}`)}
                >
                  撤回这条回复
                </button>
              )}
            {teacherMayWrite && teacherOwns && Number(c.Notes) === 0 && (
              <button
                className="math-text-button"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      mathPost("/api/question_order_comments/UpdateNotes", {
                        Notes: 1,
                        UpdateIds: c.ID,
                      }),
                    "已标记为解决",
                  )
                }
              >
                标记已解决
              </button>
            )}
          </article>
        ))}
        {mathRows(levels.data).map((l, i) => (
          <article className="math-qa-evaluation" key={l.ID || i}>
            <Star size={18} />
            <div>
              <strong>本次评价：{l.Notes || "已评价"}</strong>
              <RichContent content={l.Context} />
            </div>
          </article>
        ))}
      </div>
      {error && (
        <p className="math-error-text" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="math-account-notice" role="status">
          {notice}
        </p>
      )}
      <div className="panel math-qa-actions">
        {teacher && !teacherMayWrite && (
          <p className="math-qa-footnote">
            {row._previewOnly
              ? "历史答疑以只读方式显示，不能修改记录。"
              : "此提问已由其他老师受理，当前仅可查看，编辑与回复入口已关闭。"}
          </p>
        )}
        {teacher ? (
          <>
            <div className="math-qa-action-buttons">
              <button
                className="btn btn-secondary"
                onClick={() => setSameQuestion(true)}
              >
                查看同题答疑集
              </button>
              {teacherMayWrite && teacherUnassigned && (
                <button
                  className="btn btn-primary"
                  onClick={doAccept}
                  disabled={busy}
                >
                  接受这道提问
                </button>
              )}
              {teacherMayEditAnswer && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setText(info.BaseContent || "");
                    setImages(urls(info.BasFiles));
                    setAction("answer");
                  }}
                  disabled={busy}
                >
                  编辑老师解答
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => setAction("followup")}
                disabled={busy || !teacherMayFollow}
              >
                回复追问
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setAction("voiceReply")}
                disabled={busy || !teacherMayFollow}
              >
                语音回复追问
              </button>
              {teacherMayEditAnswer && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setAction("voiceAnswer")}
                  disabled={busy}
                >
                  语音解答
                </button>
              )}
              {teacherMayEditAnswer && Number(info.State) === 2 && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => setAction("withdrawAnswer")}
                >
                  撤回我的解答
                </button>
              )}
              {teacherMayWrite &&
                Number(info.State) >= 0 &&
                Number(info.State) <= 1 && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setAction("refuse")}
                    disabled={busy}
                  >
                    拒绝受理
                  </button>
                )}
            </div>
          </>
        ) : (
          <div className="math-qa-action-buttons">
            {Number(info.State) <= 1 && Number(info.State) >= 0 && (
              <button
                className="btn btn-secondary"
                onClick={() => setAction("cancel")}
                disabled={busy}
              >
                撤回提问
              </button>
            )}
              <button
                className="btn btn-primary"
                onClick={() => setAction("followup")}
                disabled={busy}
              >
                继续追问
              </button>
            {Number(info.State) >= 2 &&
              Number(info.State) < 4 &&
              !mathRows(levels.data).length && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setAction("rate")}
                  disabled={busy}
                >
                  评价并结束答疑
                </button>
              )}
          </div>
        )}
        {action === "withdrawAnswer" ? (
          <div className="math-qa-confirm">
            <p>确认撤回你的主解答？提问将恢复为解答中。</p>
            <button className="btn btn-secondary" onClick={() => setAction("")}>
              保留解答
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !teacherOwns}
              onClick={() =>
                updateOrder(
                  { State: 1, BaseContent: "", BasFiles: "" },
                  "你的解答已撤回",
                )
              }
            >
              确认撤回
            </button>
          </div>
        ) : action.startsWith("retract-") ? (
          <div className="math-qa-confirm">
            <p>确认撤回你发布的这条追问回复？</p>
            <button className="btn btn-secondary" onClick={() => setAction("")}>
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !teacherOwns}
              onClick={() =>
                run(
                  () =>
                    mathPost(
                      "/api/question_order_comments/Del_question_order_comments",
                      { ID: Number(action.slice(8)) },
                    ),
                  "回复已撤回",
                )
              }
            >
              确认撤回
            </button>
          </div>
        ) : action === "cancel" ? (
          <div className="math-qa-confirm">
            <p>确认撤回这条尚未解答的提问？</p>
            <button className="btn btn-secondary" onClick={() => setAction("")}>
              保留提问
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await mathPost("/api/question_orders/Del_question_orders", {
                    ID: orderId,
                  });
                  back();
                }, "提问已撤回")
              }
            >
              确认撤回
            </button>
          </div>
        ) : action === "voiceAnswer" || action === "voiceReply" ? (
          <MathVoiceRecorder
            disabled={busy}
            label={
              action === "voiceAnswer" ? "发送语音解答" : "发送语音追问回复"
            }
            onSend={(url) => sendVoice(url, action === "voiceAnswer")}
          />
        ) : (
          action && (
            <>
              <label className="math-field">
                {action === "rate"
                  ? "评价内容"
                  : action === "refuse"
                    ? "未能受理的原因"
                    : action === "answer"
                      ? "完整解答"
                      : "追问或回复内容"}
                <textarea
                  className="input"
                  value={text}
                  rows={5}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="清楚描述你的思路与解答…"
                />
              </label>
              {action !== "rate" && (
                <AttachmentInput value={images} onChange={setImages} />
              )}
              <div className="math-qa-compose-actions">
                {action === "rate" && (
                  <>
                    <select
                      className="input"
                      value={rating}
                      onChange={(e) => setRating(e.target.value)}
                      aria-label="答疑评分"
                    >
                      <option value="3">满意</option>
                      <option value="2">一般</option>
                      <option value="1">待改进</option>
                    </select>
                    <select
                      className="input"
                      value={tag}
                      onChange={(e) => setTag(e.target.value)}
                      aria-label="评价标签"
                    >
                      {[
                        "思路清晰",
                        "分析细致",
                        "通俗易懂",
                        "认真负责",
                        "体验一般",
                        "问题未被解决",
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setAction("")}
                >
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  disabled={
                    busy ||
                    (!!teacher && !teacherMayWrite) ||
                    (!text.trim() && action !== "rate" && !images.length)
                  }
                  onClick={
                    action === "rate"
                      ? evaluate
                      : action === "answer"
                        ? () =>
                            updateOrder(
                              {
                                State: 2,
                                BaseContent: text.trim(),
                                BasFiles: images.join(";"),
                              },
                              "解答已发布",
                            )
                        : action === "refuse"
                          ? () =>
                              updateOrder(
                                { State: -1, BaseContent: text.trim() },
                                "已保存未受理原因",
                              )
                          : followup
                  }
                >
                  {busy ? "保存中…" : "确认提交"}
                  <Send size={14} />
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
function UserIcon({ value }: { value: unknown }) {
  return typeof value === "string" && /^https?:/.test(value) ? (
    <img src={value} alt="" />
  ) : (
    <span className="math-qa-avatar">{String(value || "学").slice(0, 1)}</span>
  );
}

function SameQuestionHistory({
  stuid,
  teacher,
  qid,
  back,
}: {
  stuid: string;
  teacher: MathRow;
  qid: number | string;
  back: () => void;
}) {
  const [page, setPage] = useState(1);
  const [current, setCurrent] = useState<MathRow>();
  const remote = useData(`teacher-same-question-${qid}-${page}`, () =>
    mathCommand("GetQuestionOrderCountsList", {
      System_Station_ID: 1,
      QuestionID: qid,
      page,
      limit: 20,
    }),
  );
  const rows = mathRows(remote.data);
  if (current)
    return (
      <QuestionOrder
        row={current}
        stuid={stuid}
        teacher={teacher}
        back={() => setCurrent(undefined)}
      />
    );
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回当前答疑
      </button>
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">SAME QUESTION, DIFFERENT THOUGHTS</span>
          <h2>同一道题的答疑记录</h2>
          <p>查看同题历史疑问与解答，历史记录以只读方式展开。</p>
        </div>
      </div>
      <div className="panel">
        <RequestState
          loading={remote.loading}
          error={remote.error}
          empty={!remote.loading && !rows.length}
          reload={remote.reload}
        />
        <OrderList
          rows={rows.map((r) => ({
            ...r,
            QuestionID: r.QID || qid,
            AddTime: r.QTime || r.UpdateTime,
            _previewOnly: true,
          }))}
          open={setCurrent}
        />
        <div className="math-qa-pagination">
          <button
            className="btn btn-secondary"
            disabled={page === 1 || remote.loading}
            onClick={() => setPage((v) => v - 1)}
          >
            上一页
          </button>
          <span>第 {page} 页</span>
          <button
            className="btn btn-secondary"
            disabled={rows.length < 20 || remote.loading}
            onClick={() => setPage((v) => v + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

function TeacherDesk({
  teachers,
  stuid,
  back,
}: {
  teachers: MathRow[];
  stuid: string;
  back: () => void;
}) {
  const [tab, setTab] = useState("待受理");
  const [tags, setTags] = useState(teachers[0]?.Tags || "会员");
  const teacher = teachers.find((t) => t.Tags === tags) || teachers[0];
  const allowedTags = [
    ...new Set(teachers.map((t) => String(t.Tags || "会员"))),
  ];
  const [page, setPage] = useState(1);
  const [current, setCurrent] = useState<MathRow>();
  const [notice, setNotice] = useState("");
  const work = useData(`qa-work-${teacher.TeacherID}`, () =>
    mathCommand("GetQuestionTeacherWorkToday", {
      TeacherID: teacher.TeacherID,
      System_Station_ID: station,
    }),
  );
  const counts = useData(`qa-work-count-${teacher.TeacherID}-${tags}`, () =>
    mathCommand(
      tags === "真题"
        ? "GetNewAnswerTeacherCounts"
        : tags === "飞轮"
          ? "GetAnswerTeacherCounts_fx"
          : "GetAnswerTeacherCounts",
      { TeacherID: teacher.TeacherID, System_Station_ID: station },
    ),
  );
  const commands: Record<string, string> = {
    待受理: "GetNewQuestionOrderUnAnswerList",
    解答中: "GetQuestionOrderUnAnswerListOfTeacher",
    已解答: "GetNewQuestionOrderAnswerlistOfTeacher",
    待回复追问: "GetQuestionOrderUnCommentListOfTeacher",
    未受理: "GetNewQuestionOrderAnswerRefuseListOfTeacher",
    历史评价: "getNewQuestionOrderLevelListOfTeacher",
  };
  const remote = useData(
    `qa-teacher-list-${teacher.TeacherID}-${tab}-${tags}-${page}`,
    () =>
      mathCommand(commands[tab], {
        TeacherID: teacher.TeacherID,
        Tags: tags,
        System_Station_ID: station,
        page,
        limit: 30,
      }),
  );
  const rows = mathRows(remote.data);
  const workInfo = mathRows(work.data)[0];
  const stats = mathRows(counts.data)[0] || {};
  if (current)
    return (
      <QuestionOrder
        row={current}
        stuid={stuid}
        teacher={teacher}
        back={() => {
          setCurrent(undefined);
          remote.reload();
          counts.reload();
        }}
      />
    );
  const sign = async (end = false) => {
    if (!workInfo?.ID) return;
    try {
      await mathPost("/api/question_teacher_work/Inner_question_teacher_work", {
        ID: workInfo.ID,
        [end ? "EndTime" : "StartTime"]: stamp(),
        UpdateColumns: end ? "ID,EndTime" : "ID,StartTime",
      });
      setNotice(end ? "已完成下班打卡" : "已完成上班打卡");
      work.reload();
    } catch (e) {
      setNotice(failure(e));
    }
  };
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={16} />
        返回我的答疑
      </button>
      <div className="math-qa-heading">
        <div>
          <span className="eyebrow">TEACHING DESK</span>
          <h2>{teacher.TeacherName || "老师"}的答疑工作台</h2>
          <p>接受提问、解答与追问。</p>
        </div>
        <select
          className="input"
          value={tags}
          onChange={(e) => {
            setTags(e.target.value);
            setPage(1);
          }}
          aria-label="答疑业务分类"
        >
          {allowedTags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="panel math-teacher-summary">
        <div>
          <span>当前排班</span>
          <strong>
            {workInfo
              ? `${date(workInfo.StartTime)} — ${date(workInfo.EndTime)}`
              : "今天暂无排班"}
          </strong>
        </div>
        <div>
          <span>待解答</span>
          <strong>
            {stats.UnAnswer ??
              stats.WaitAnswerCounts ??
              stats.UnAnswerCount ??
              "—"}
          </strong>
        </div>
        <div>
          <span>已解答</span>
          <strong>
            {stats.Answered ?? stats.AnswerCount ?? stats.AnswerCounts ?? "—"}
          </strong>
        </div>
        <div>
          <span>解答中</span>
          <strong>{stats.Answering ?? "—"}</strong>
        </div>
        <div>
          <span>待回复追问</span>
          <strong>{stats.NewCommentCounts ?? "—"}</strong>
        </div>
        {workInfo && (
          <div className="math-qa-action-buttons">
            <button
              className="btn btn-secondary"
              disabled={
                !!workInfo.StartTime &&
                !/^(1900|0001)/.test(String(workInfo.StartTime))
              }
              onClick={() => sign()}
            >
              上班打卡
            </button>
            <button
              className="btn btn-secondary"
              disabled={
                !!workInfo.EndTime &&
                !/^(1900|0001)/.test(String(workInfo.EndTime))
              }
              onClick={() => sign(true)}
            >
              下班打卡
            </button>
          </div>
        )}
      </div>
      {notice && <p className="math-account-notice">{notice}</p>}
      <div className="panel">
        <div className="math-toolbar">
          <div className="tabs">
            {Object.keys(commands).map((t) => (
              <button
                className={t === tab ? "active" : ""}
                key={t}
                onClick={() => {
                  setTab(t);
                  setPage(1);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            className="math-icon-button"
            onClick={remote.reload}
            aria-label="刷新老师答疑列表"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <RequestState
          loading={remote.loading}
          error={remote.error}
          empty={!remote.loading && !rows.length}
          reload={remote.reload}
        />
        {tab === "历史评价" ? (
          <div className="math-qa-teacher-reviews">
            {rows.map((r, i) => (
              <article key={r.ID || i}>
                <div>
                  <span className="math-tag">
                    {Number(r.BusID) === 3
                      ? "好评"
                      : Number(r.BusID) === 2
                        ? "中评"
                        : "待改进"}
                  </span>
                  <small>{date(r.AddTime)}</small>
                </div>
                <h4>{r.Notes || "学生评价"}</h4>
                <RichContent content={r.Content || r.Context} />
                <p>
                  {r.BookName || r.Name || ""} · 第 {r.QuestionPage || "—"} 页 ·
                  第 {r.QuestionIndex || "—"} 题
                </p>
                <button
                  className="btn btn-secondary"
                  disabled={!r.Json || !r.QID}
                  onClick={() =>
                    setCurrent({
                      ...r,
                      ID: r.Json,
                      QuestionID: r.QID,
                      _previewOnly: true,
                    })
                  }
                >
                  查看这次答疑
                  <ChevronRight size={15} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <OrderList rows={rows} open={setCurrent} />
        )}
        <div className="math-qa-pagination">
          <button
            className="btn btn-secondary"
            disabled={page === 1 || remote.loading}
            onClick={() => setPage((v) => v - 1)}
          >
            上一页
          </button>
          <span>第 {page} 页</span>
          <button
            className="btn btn-secondary"
            disabled={rows.length < 30 || remote.loading}
            onClick={() => setPage((v) => v + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
