import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { mathGet, mathRows } from "../api/math";
import type { MathRow } from "../api/math";
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
export default function MathInformationResources({ stuid }: { stuid: string }) {
  const remote = useData(`knowledge-${stuid}`, () =>
    mathGet("/api/headimg_list/GetListByAll", {
      System_Station_ID: 1,
      BusType: "考研知识",
      StuID: stuid,
      IsValid: 1,
      Type: -1,
      IsLayer: 1,
    }),
  );
  const [selected, setSelected] = useState<MathRow>();
  useEffect(() => setSelected(undefined), [stuid]);
  if (selected)
    return (
      <KnowledgeArticle
        row={selected}
        stuid={stuid}
        back={() => setSelected(undefined)}
      />
    );
  const rows = mathRows(remote.data);
  return (
    <section className="math-workspace">
      <div className="math-toolbar">
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
      <div className="panel math-content-list">
        {rows.map((r, i) => (
          <button key={r.ID || i} onClick={() => setSelected(r)}>
            {url(r.HeadImg) ? (
              <img
                className="mir-thumbnail"
                src={String(r.HeadImg).replaceAll(".png_yjs", ".png").split(";")[0]}
                alt=""
              />
            ) : (
              <div className="math-list-icon"><BookOpen size={20} /></div>
            )}
            <span>
              <strong>{r.Name || r.Title || r.BusValue || "考研知识"}</strong>
              <small>{r.Notes || "点击阅读详细内容"}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
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
