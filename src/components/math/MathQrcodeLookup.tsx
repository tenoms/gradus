import { useState } from "react";
import { ArrowLeft, ChevronRight, LoaderCircle, QrCode } from "lucide-react";
import type { MathRow } from "../../platforms/math";
import { mathQrcodeKey } from "../../platforms/math-qrcode";
import { useSession } from "../../lib/session";
import { resolveMathBookQrcode } from "../../platforms/math-access";
import MathQuestionVideo from "./MathQuestionVideo";
export default function MathQrcodeLookup({
  back,
  onQuestion,
}: {
  back: () => void;
  onQuestion: (row: MathRow) => void;
}) {
  const { session } = useSession();
  const stuid = String(session.platforms.math.user?.StuID || "");
  const [input, setInput] = useState(""),
    [rows, setRows] = useState<MathRow[]>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回资料库
      </button>
      <div className="panel mir-article">
        <span className="eyebrow">BOOK QRCODE</span>
        <h2>打开书籍配套内容</h2>
        <p className="math-muted">
          用手机扫描书上的二维码后，复制链接到这里；也可以粘贴原二维码编号。
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setRows(undefined);
            try {
              const qrcode = mathQrcodeKey(input);
              if (!qrcode) throw new Error("请先输入书籍二维码链接或编号");
              const result = await resolveMathBookQrcode(qrcode, stuid);
              if (!result.length)
                throw new Error(
                  "这个二维码暂未提供配套学习内容，请核对链接后重试",
                );
              setRows(result);
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="math-field">
            二维码链接或编号
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="粘贴书籍二维码链接"
              required
            />
          </label>
          <button className="btn btn-primary" disabled={busy || !input.trim()}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <QrCode size={16} />
            )}
            {busy ? "正在读取配套内容…" : "打开配套内容"}
          </button>
        </form>
        {error && (
          <p className="math-error-text" role="alert">
            {error}
          </p>
        )}
        {rows?.map((r, i) => (
          <section key={r.ID || i} className="math-analysis-block">
            {Number(r.isVideo) === 1 ? (
              <MathQuestionVideo
                row={{
                  ...r,
                  PolyvVID: r.videoID,
                  Title: r.BookName || "书籍配套视频",
                }}
              />
            ) : r.videoID ? (
              <button
                className="btn btn-secondary"
                onClick={() =>
                  onQuestion({
                    ...r,
                    QuestionID: r.videoID,
                    BookID: r.bookID,
                    BookName: r.BookName,
                  })
                }
              >
                查看{r.BookName || "书籍"}原题与解析
                <ChevronRight size={16} />
              </button>
            ) : (
              <p className="math-muted">
                当前二维码的学习内容正在准备中，请稍后再查看。
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
