import { useState } from "react";
import { FileImage, X } from "lucide-react";
import { studyFetch } from "../../../shared/api/client";
import { mathData } from "../api/math";
import "./math-attachment-input.css";

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
    throw new Error("附件暂时无法使用，请重新上传。");
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="math-attachments">
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
        <label className="math-attach-button">
          <FileImage size={18} />
          <span>{busy ? "上传中…" : "添加图片"}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => upload(e.target.files)}
            aria-label="上传图片附件"
          />
        </label>
      )}
      {error && <p className="math-error-text">{error}</p>}
    </div>
  );
}
