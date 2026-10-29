import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import RichContent from "../RichContent";
import { mathGet, mathPost, mathRows } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import { mathUpdateListQuery, mathOwnUpdateLogs } from "../../platforms/math-information";
import "./math-information-resources.css";
const url = (value: any) =>
  typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
function useData(key: string, load: () => Promise<any>) {
  const [data, setData] = useState<any>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    load()
      .then((r) => {
        if (active) setData(r);
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
function Status({
  loading,
  error,
  empty,
  retry,
}: {
  loading: boolean;
  error: string;
  empty: boolean;
  retry: () => void;
}) {
  return loading ? (
    <div className="math-state">
      <LoaderCircle className="spin" size={23} />
      <p>正在读取平台内容…</p>
    </div>
  ) : error ? (
    <div className="math-state math-error">
      <p>{error}</p>
      <button className="btn btn-secondary" onClick={retry}>
        重新加载
      </button>
    </div>
  ) : empty ? (
    <div className="math-state">
      <BookOpen size={28} />
      <p>当前没有可阅读的内容</p>
    </div>
  ) : null;
}
export default function MathInformationResources({
  stuid,
  kind,
}: {
  stuid: string;
  kind: "knowledge" | "updates";
}) {
  const remote = useData(`${kind}-${stuid}`, () =>
    kind === "knowledge"
      ? mathGet("/api/headimg_list/GetListByAll", {
          System_Station_ID: 1,
          BusType: "考研知识",
          StuID: stuid,
          IsValid: 1,
          Type: -1,
          IsLayer: 1,
        })
      : mathGet(mathUpdateListQuery(stuid).path, mathUpdateListQuery(stuid).query),
  );
  const [selected, setSelected] = useState<MathRow>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setSelected(undefined);
    setNotice("");
    setError("");
  }, [kind]);
  if (selected && kind === "knowledge")
    return (
      <KnowledgeArticle
        row={selected}
        stuid={stuid}
        back={() => setSelected(undefined)}
      />
    );
  const rows = mathRows(remote.data).filter(
    (r) =>
      kind !== "updates" ||
      !r.BusValue ||
      /^(0001|1900)/.test(String(r.BusValue)) ||
      new Date(r.BusValue).getTime() <= Date.now(),
  );
  const log = async (row: MathRow, type: "give" | "tread" | "read") => {
    const logs = mathOwnUpdateLogs(row, stuid);
    const prior = logs.find(
      (r) =>
        (type === "read"
          ? r.BusType === "read"
          : ["give", "tread"].includes(r.BusType)),
    );
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (prior && type !== "read")
        await mathPost("/api/content_list_log/Del_content_list_log", {
          ID: prior.ID,
        });
      if ((!prior || prior.BusType !== type) && !(type === "read" && prior))
        await mathPost("/api/content_list_log/Inner_content_list_log", {
          BusType: type,
          BusID: 1,
          CID: row.ID,
          BusValue: stuid,
          System_Station_ID: 1,
          BusNotes:
            type === "read" ? "阅读" : type === "give" ? "点赞" : "踩赞",
        });
      setNotice(type === "read" ? "已标记为已读" : "反馈已同步");
      remote.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="math-workspace">
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">
            {kind === "knowledge" ? "GRADUATE STUDY GUIDE" : "PLATFORM UPDATES"}
          </span>
          <h2>{kind === "knowledge" ? "考研知识" : "平台更新"}</h2>
          <p>
            {kind === "knowledge"
              ? "阅读原平台发布的考研知识与学习资料。"
              : "查看平台发布的功能调整，保留你的阅读与评价记录。"}
          </p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={remote.loading}
          onClick={remote.reload}
        >
          <RefreshCw size={15} />
          刷新
        </button>
      </div>
      <Status
        loading={remote.loading}
        error={remote.error}
        empty={!rows.length}
        retry={remote.reload}
      />
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
      {kind === "knowledge" ? (
        <div className="panel math-content-list">
          {rows.map((r, i) => (
            <button key={r.ID || i} onClick={() => setSelected(r)}>
              {url(r.HeadImg) ? (
                <img
                  className="mir-thumbnail"
                  src={
                    String(r.HeadImg)
                      .replaceAll(".png_yjs", ".png")
                      .split(";")[0]
                  }
                  alt=""
                />
              ) : (
                <div className="math-list-icon">
                  <BookOpen size={20} />
                </div>
              )}
              <span>
                <strong>{r.Name || r.Title || r.BusValue || "考研知识"}</strong>
                <small>{r.Notes || "点击阅读详细内容"}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <div className="mir-updates">
          {rows.map((r, i) => {
            const own = mathOwnUpdateLogs(r, stuid);
            return (
              <article className="panel" key={r.ID || i}>
                <div className="mir-update-date">
                  <time>
                    {String(r.BusValue || r.AddTime || "")
                      .replace("T", " ")
                      .slice(0, 10)}
                  </time>
                  {own.some((l: MathRow) => l.BusType === "read") && (
                    <span>
                      <Check size={13} />
                      已读
                    </span>
                  )}
                </div>
                <RichContent
                  content={r.Json || r.Content || r.Contexts || r.Title}
                />
                <div className="mir-update-actions">
                  <button
                    className={
                      own.some((l: MathRow) => l.BusType === "give")
                        ? "active"
                        : ""
                    }
                    disabled={busy}
                    onClick={() => log(r, "give")}
                    aria-label="赞同这条平台更新"
                  >
                    <ThumbsUp size={15} />
                    {r.Give || 0}
                  </button>
                  <button
                    className={
                      own.some((l: MathRow) => l.BusType === "tread")
                        ? "active"
                        : ""
                    }
                    disabled={busy}
                    onClick={() => log(r, "tread")}
                    aria-label="不赞同这条平台更新"
                  >
                    <ThumbsDown size={15} />
                    {r.tread || 0}
                  </button>
                  {!own.some((l: MathRow) => l.BusType === "read") && (
                    <button disabled={busy} onClick={() => log(r, "read")}>
                      <Check size={15} />
                      标记已读
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
function KnowledgeArticle({
  row,
  stuid,
  back,
}: {
  row: MathRow;
  stuid: string;
  back: () => void;
}) {
  const remote = useData(`knowledge-article-${row.ID}`, () =>
    Number(row.IsToUrl) === 1
      ? mathGet("/api/headimg_list/GetListByAll", {
          ID: row.ID,
          StuID: stuid,
          IsValid: Number(row.ID) === 238 ? -1 : 1,
        })
      : Promise.resolve({ data: [row] }),
  );
  const current = mathRows(remote.data)[0] || row;
  const files = String(current.Files || "")
    .replaceAll(".png_yjs", ".png")
    .split(";")
    .filter(url);
  const image = String(current.HeadImg || "")
    .replaceAll(".png_yjs", ".png")
    .split(";")[0];
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回考研知识
      </button>
      <article className="panel mir-article">
        <h2>
          {current.Name || current.Title || current.BusValue || "考研知识"}
        </h2>
        <Status
          loading={remote.loading}
          error={remote.error}
          empty={false}
          retry={remote.reload}
        />
        <RichContent
          content={current.Contexts || current.Content || current.Notes}
        />
        {files.length ? (
          files.map((file, i) =>
            /\.(png|jpe?g|gif|webp)(\?|$)/i.test(file) ? (
              <a key={file} href={file} target="_blank" rel="noreferrer">
                <img src={file} alt={`知识内容第${i + 1}页`} />
              </a>
            ) : (
              <a
                className="btn btn-secondary"
                key={file}
                href={file}
                target="_blank"
                rel="noreferrer"
              >
                打开学习资料
                <ExternalLink size={15} />
              </a>
            ),
          )
        ) : url(image) ? (
          <a href={image} target="_blank" rel="noreferrer">
            <img src={image} alt="考研知识内容" />
          </a>
        ) : null}
        {url(current.Url) && (
          <a
            className="btn btn-primary"
            href={url(current.Url)}
            target="_blank"
            rel="noreferrer"
          >
            阅读原文
            <ExternalLink size={15} />
          </a>
        )}
        {!current.Contexts &&
          !current.Content &&
          !current.Notes &&
          !files.length &&
          !url(image) &&
          !url(current.Url) &&
          !remote.loading && (
            <p className="math-muted">此条内容暂未提供可阅读正文或原文地址。</p>
          )}
      </article>
    </div>
  );
}
