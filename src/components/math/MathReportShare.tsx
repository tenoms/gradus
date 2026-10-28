import { useState } from "react";
import type { RefObject } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { createMathReportSnapshot } from "./math-report-share";
import { reportSnapshotFilename } from "./report-share-model.mjs";
import "./math-report-share.css";

export default function MathReportShare({
  rootRef,
  title = "学习报告",
}: {
  rootRef: RefObject<HTMLElement | null>;
  title?: string;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  function download() {
    const root = rootRef.current;
    setNotice("");
    setError("");
    if (!root) {
      setError("报告尚未加载，请在报告显示后重试。");
      return;
    }
    setBusy(true);
    try {
      const now = new Date(),
        blob = createMathReportSnapshot(root, title, now),
        url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = reportSnapshotFilename(title, now);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("报告快照已下载，可在浏览器中打开并打印。");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "报告快照导出失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="math-report-share" data-report-share-ignore>
      <button className="btn btn-secondary" disabled={busy} onClick={download}>
        {busy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Download size={16} />
        )}
        下载报告快照
      </button>
      <p>
        仅导出当前已加载的报告内容，不会自动公开。下载的 HTML
        可在浏览器中打开、打印。
      </p>
      {notice && <span role="status">{notice}</span>}
      {error && (
        <span className="math-report-share-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
