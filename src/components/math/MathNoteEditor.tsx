import { useEffect, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import {
  mathApi,
  mathData,
  mathRows,
} from "../../platforms/math";
import type { NoteKind } from "../../platforms/math";
import { useSession } from "../../lib/session";
import { AttachmentInput } from "./MathQuestions";
function msg(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function useRemote<T>(key: string, load: () => Promise<T>) {
  const [data, setData] = useState<T>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    load()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
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
function State({
  loading,
  error,
  reload,
}: {
  loading?: boolean;
  error?: string;
  reload?: () => void;
}) {
  if (loading)
    return (
      <div className="math-state">
        <LoaderCircle className="spin" size={22} />
        <p>正在读取笔记…</p>
      </div>
    );
  if (error)
    return (
      <div className="math-state math-error">
        <p>{error}</p>
        <button className="btn btn-secondary" onClick={reload}>
          重新加载
        </button>
      </div>
    );
  return null;
}
export default function MathNoteEditor({
  qid,
  bookId,
  stuid,
  kind,
  close,
  source = "电子书",
  isCourse = false,
}: {
  qid: string | number;
  bookId: number;
  stuid: string;
  kind: NoteKind;
  close: () => void;
  source?: string;
  isCourse?: boolean;
}) {
  const { session } = useSession();
  const user = session.platforms.math.user || {};
  const remote = useRemote(`note-edit-${kind}-${qid}`, async () => {
    const [catalogs, notes] = await Promise.all([
      mathApi.noteCatalogs(stuid, kind, user.SubjectType || "数一"),
      mathApi.questionNotes(stuid, kind, qid),
    ]);
    return { catalogs: mathRows(catalogs), notes: mathRows(notes) };
  });
  const [catalogId, setCatalogId] = useState("");
  const [newCatalog, setNewCatalog] = useState("默认分类");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (remote.data) {
      const existing = remote.data.notes[0];
      setContent(existing?.Content || "");
      setImages(
        typeof existing?.ContentImg === "string"
          ? existing.ContentImg.split(",").filter(Boolean)
          : Array.isArray(existing?.ContentImg)
            ? existing.ContentImg
            : [],
      );
      setCatalogId(
        String(existing?.CatalogID || remote.data.catalogs[0]?.ID || ""),
      );
    }
  }, [remote.data]);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (!remote.data) throw new Error("请先读取当前笔记");
      let id = Number(catalogId);
      if (!id) {
        const result = await mathApi.createNoteCatalog(
          stuid,
          kind,
          newCatalog.trim() || "默认分类",
        );
        const data = mathData(result);
        id = Number(typeof data === "object" ? data?.ID : data);
        if (!id) throw new Error("分类创建失败，请刷新后重试");
      }
      const existing = remote.data?.notes[0];
      await mathApi.saveNote({
        StuID: stuid,
        Type: kind,
        QuestionID: qid,
        BookID: bookId,
        Source: source,
        IsCourse: isCourse ? "2" : "1",
        Content: content,
        ContentImg: images.join(","),
        CatalogID: id,
        ...(existing?.ID
          ? {
              ID: existing.ID,
              UpdateColumns: "CatalogID,Source,Content,ContentImg",
            }
          : {}),
      });
      setSaved(true);
    } catch (e) {
      setError(msg(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="math-modal-backdrop" onClick={close}>
      <section
        className="math-modal panel"
        role="dialog"
        aria-modal="true"
        aria-label={`保存${kind}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="math-modal-heading">
          <h3>
            保存到
            {kind === "错题" ? "错题本" : kind === "收藏" ? "收藏夹" : "笔记本"}
          </h3>
          <button
            className="math-icon-button"
            aria-label="关闭"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {saved ? (
          <div className="math-state">
            <Check size={32} />
            <h3>已同步到数学平台</h3>
            <p>可以在复习或笔记页面继续查看。</p>
            <button className="btn btn-primary" onClick={close}>
              完成
            </button>
          </div>
        ) : (
          <>
            <State
              loading={remote.loading}
              error={remote.error}
              reload={remote.reload}
            />
            {!remote.loading && !remote.error && (
              <>
                <label className="math-field">
                  保存分类
                  <select
                    className="input"
                    value={catalogId}
                    onChange={(e) => setCatalogId(e.target.value)}
                  >
                    <option value="">新建分类</option>
                    {remote.data?.catalogs.map((c) => (
                      <option key={c.ID} value={c.ID}>
                        {c.Name}
                      </option>
                    ))}
                  </select>
                </label>
                {!catalogId && (
                  <label className="math-field">
                    分类名称
                    <input
                      className="input"
                      value={newCatalog}
                      onChange={(e) => setNewCatalog(e.target.value)}
                      maxLength={50}
                    />
                  </label>
                )}
                <label className="math-field">
                  我的思考
                  <textarea
                    className="input"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="记录易错点、解题思路或复习提醒…"
                    rows={6}
                  />
                </label>
                <AttachmentInput value={images} onChange={setImages} max={3} />
                {error && (
                  <p role="alert" className="math-error-text">
                    {error}
                  </p>
                )}
                <div className="math-modal-actions">
                  <button className="btn btn-secondary" onClick={close}>
                    取消
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={save}
                    disabled={saving}
                  >
                    {saving ? "同步中…" : "保存到平台"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
