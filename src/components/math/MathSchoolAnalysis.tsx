import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
} from "lucide-react";
import { mathGet, mathRows } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import MathQuestionVideo from "./MathQuestionVideo";
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
      <p>正在读取院校分析…</p>
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
      <p>当前暂无已发布的院校分析内容</p>
    </div>
  ) : null;
}
export default function MathSchoolAnalysis() {
  const remote = useData("school-analysis", () =>
    mathGet("/api/s_school/GetListByAll", { IsVideo: 1 }),
  );
  const [school, setSchool] = useState<MathRow>(),
    [search, setSearch] = useState("");
  if (school)
    return <SchoolContent school={school} back={() => setSchool(undefined)} />;
  const rows = mathRows(remote.data).filter(
    (r) =>
      !search ||
      [r.Name, r.SchoolName, r.Province, r.Notes].join(" ").includes(search),
  );
  return (
    <div className="math-workspace">
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">SCHOOL INSIGHTS</span>
          <h2>院校分析</h2>
          <p>查看原平台发布的院校讲解视频与配套资料。</p>
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
      <div className="panel">
        <div className="math-toolbar">
          <label className="math-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索院校名称…"
              aria-label="搜索院校分析"
            />
          </label>
        </div>
        <Status
          loading={remote.loading}
          error={remote.error}
          empty={!rows.length}
          retry={remote.reload}
        />
        <div className="math-content-list">
          {rows.map((r, i) => (
            <button key={r.ID || i} onClick={() => setSchool(r)}>
              <div className="math-list-icon">
                <Play size={19} />
              </div>
              <span>
                <strong>{r.Name || r.SchoolName || "院校分析"}</strong>
                <small>{r.Province || r.Notes || "查看视频与资料"}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function SchoolContent({
  school,
  back,
}: {
  school: MathRow;
  back: () => void;
}) {
  const remote = useData(`school-analysis-${school.ID}`, () =>
    mathGet("/api/s_school_files/GetListByAll", {
      SchoolID: school.ID,
      SortDesc: "Sort",
    }),
  );
  const [tab, setTab] = useState("讲解视频"),
    [index, setIndex] = useState(0);
  const rows = mathRows(remote.data),
    videos = rows.filter((r) => Number(r.BusType) === 1),
    files = rows.filter((r) => Number(r.BusType) !== 1),
    current = videos[index],
    video = current?._w_courseware || {};
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回院校分析
      </button>
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">SCHOOL INSIGHTS</span>
          <h2>{school.Name || school.SchoolName || "院校分析"}</h2>
        </div>
      </div>
      <div className="panel">
        <div className="math-toolbar">
          <div className="tabs">
            {["讲解视频", "配套资料"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <Status
          loading={remote.loading}
          error={remote.error}
          empty={!rows.length}
          retry={remote.reload}
        />
        {tab === "讲解视频" ? (
          <div className="mir-article">
            {current &&
              (video.PolyvVID ? (
                <MathQuestionVideo
                  key={video.ID || current.ID}
                  row={{
                    ...video,
                    VideoID: video.ID || 0,
                    Title: video.Name || video.PlovyName || current.Title,
                    PolyvVID: video.PolyvVID,
                  }}
                />
              ) : (
                <p className="math-muted">当前视频暂未提供可播放内容。</p>
              ))}
            <div className="math-content-list">
              {videos.map((r, i) => {
                const data = r._w_courseware || {};
                return (
                  <button key={r.ID || i} onClick={() => setIndex(i)}>
                    <div className="math-list-icon">
                      <Play size={18} />
                    </div>
                    <span>
                      <strong>
                        {data.Name ||
                          data.PlovyName ||
                          r.Title ||
                          `视频${i + 1}`}
                      </strong>
                      <small>
                        {data.Duration || ""}
                        {index === i ? " · 当前视频" : ""}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
            {!videos.length && !remote.loading && (
              <p className="math-muted">当前院校暂无讲解视频。</p>
            )}
          </div>
        ) : (
          <div className="mir-article">
            {files.flatMap((r) =>
              String(r.BusValue || r.HeadImg || "")
                .replaceAll(".png_yjs", ".png")
                .split(";")
                .filter((v) => /^https?:\/\//i.test(v))
                .map((url, i) =>
                  /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) ? (
                    <a
                      key={`${r.ID}-${i}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img src={url} alt={r.Name || `院校分析资料${i + 1}`} />
                    </a>
                  ) : (
                    <a
                      key={`${r.ID}-${i}`}
                      className="btn btn-secondary"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.Name || r.Title || "查看配套资料"}
                      <ExternalLink size={15} />
                    </a>
                  ),
                ),
            )}
            {!files.length && !remote.loading && (
              <p className="math-muted">当前院校暂无配套资料。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
