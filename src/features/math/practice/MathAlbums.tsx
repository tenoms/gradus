import { invalidateCatalogResources } from "../../../shared/api/client";
import { useMathLearningPlan } from "../preparation/MathLearningPlan";
import { groupMathAlbums, mathStages } from "../preparation/learning-plan-model.mjs";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  LoaderCircle,
  Search,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import MathQuestionVideo from "../questions/MathQuestionVideo";
import MathQuestionStem from "../questions/MathQuestionStem";
import MathModelTraining from "./MathModelTraining";
import {
  mathApi,
  mathCommand,
  mathGet,
  mathImage,
  mathPost,
  mathRows,
  mathTitle,
} from "../api/math";
import type { MathRow } from "../api/math";
import { useSession } from "../../../shared/auth/session";
import { recordStudy } from "../../learning/state/store";
import { useStudyTimer } from "../../learning/time/use-study-timer";

function useAlbumData(key: string, load: () => Promise<any>) {
  const [data, setData] = useState<any>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
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
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, version]);
  return { data, loading, error, reload: () => { invalidateCatalogResources(); setVersion((v) => v + 1); } };
}
function Status({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  retry?: () => void;
}) {
  if (loading)
    return (
      <div className="math-state">
        <LoaderCircle className="spin" size={23} />
        <p>正在读取数学专辑…</p>
      </div>
    );
  if (error)
    return (
      <div className="math-state math-error">
        <p>{error}</p>
        {retry && (
          <button className="btn btn-secondary" onClick={retry}>
            重新加载
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="math-state">
        <BookOpen size={28} />
        <p>这个章节暂无学习内容</p>
      </div>
    );
  return null;
}
function contentTree(rows: MathRow[]): MathRow[] {
  const copies: MathRow[] = rows.map((r) => ({
    ...r,
    children: [] as MathRow[],
  }));
  const map = new Map(copies.map((r) => [String(r.ID), r]));
  for (const row of copies) {
    const parent = map.get(String(row.PID));
    if (parent && parent !== row) parent.children.push(row);
  }
  return copies
    .filter((r) => !map.has(String(r.PID)) || !r.PID || r.ID === r.PID)
    .sort((a, b) => Number(a.Sort || 0) - Number(b.Sort || 0));
}
function fileLinks(row: MathRow) {
  return [row.Files, row.Url, row.FileUrl, row.BusUrl]
    .flatMap((v) => (typeof v === "string" ? v.split(/[;,]/) : []))
    .filter((v) => /^https?:\/\//.test(v));
}

export default function MathAlbums({
  stuid,
  onQuestion,
}: {
  stuid: string;
  onQuestion: (row: MathRow) => void;
}) {
  const { refresh } = useSession();
  const { stage } = useMathLearningPlan();
  const [stageFilter, setStageFilter] = useState("全部阶段");
  const [myOnly, setMyOnly] = useState(false);
  const profile = useAlbumData(`album-profile-${stuid}`, () =>
    mathCommand("GetUserInfoByStuID", { StuID: stuid, t: Date.now() }),
  );
  const currentProfile = mathRows(profile.data)[0] || {};
  const mine = String(currentProfile.AlbumIDs || "")
    .split(",")
    .filter(Boolean);
  const albums = useAlbumData("all-albums", mathApi.albums);
  const [album, setAlbum] = useState<MathRow>();
  const [catalog, setCatalog] = useState<MathRow>();
  const [query, setQuery] = useState("");
  const info = useAlbumData(`album-info-${album?.ID}`, () =>
    album
      ? mathCommand("GetAlbumInfo", { AlbumID: album.ID })
      : Promise.resolve({ data: [] }),
  );
  const albumInfo = mathRows(info.data)[0];
  const fullAlbum = { ...album, ...albumInfo };
  const chapters = useAlbumData(`chapters-${album?.ID}`, () =>
    album ? mathApi.albumCatalog(album.ID) : Promise.resolve({ data: [] }),
  );
  const items = useAlbumData(`content-${catalog?.ID}`, () =>
    catalog ? mathApi.albumItems(catalog.ID) : Promise.resolve({ data: [] }),
  );
  const progress = useAlbumData(
    `album-progress-${album?.ID}-${catalog?.ID}`,
    () =>
      catalog
        ? mathGet("/api/book_highscorealbum_studylog/GetListByPage", {
            AlbumID: album?.ID,
            CatalogID: catalog.ID,
            StuID: stuid,
            limit: 1,
            page: 1,
            SortDesc: "AddTime Desc",
            Type: "章节",
          })
        : Promise.resolve({ data: [] }),
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [practice, setPractice] = useState<MathRow>();
  useStudyTimer({
    key: `math-album-reading:${stuid}:${album?.ID || ""}:${catalog?.ID || ""}`,
    platform: "math",
    title: `${mathTitle(fullAlbum)} · ${catalog ? mathTitle(catalog) : "专辑章节"}`,
    path: "/study/resources",
    enabled: !!album && !!catalog && !practice && !items.loading && !items.error && mathRows(items.data).length > 0,
  });
  if (practice)
    return (
      <MathModelTraining
        stuid={stuid}
        albumId={practice.AlbumID || album?.ID}
        catalogId={practice.CatalogID || catalog?.ID}
        groupId={practice.ID}
        kind="album"
        onClose={() => setPractice(undefined)}
      />
    );
  const toggleShelf = async () => {
    if (!album || !currentProfile.ID) return;
    setBusy(true);
    setNotice("");
    try {
      const present = mine.includes(String(album.ID));
      const next = present
        ? mine.filter((id) => id !== String(album.ID))
        : [...mine, String(album.ID)];
      await mathPost("/api/sys_users/Inner_sys_users", {
        ID: currentProfile.ID,
        StuID: stuid,
        AlbumIDs: [...new Set(next)].join(","),
        UpdateColumns: "ID,AlbumIDs",
      });
      profile.reload();
      await refresh();
      setNotice(
        present ? "专辑已从我的学习列表移出" : "专辑已加入我的学习列表",
      );
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveReading = async (BusID: number | string) => {
    if (!album || !catalog) return;
    setBusy(true);
    setNotice("");
    try {
      const previous = mathRows(progress.data)[0];
      await mathPost(
        "/api/book_highscorealbum_studylog/Inner_book_highscorealbum_studylog",
        {
          Type: "章节",
          CatalogID: catalog.ID,
          AlbumID: album.ID,
          StuID: stuid,
          BusID,
          ...(previous?.ID
            ? {
                ID: previous.ID,
                AddTime: new Date().toLocaleString("sv-SE", {
                  timeZone: "Asia/Shanghai",
                }),
                UpdateColumns: "ID,BusID,AddTime",
              }
            : {}),
        },
      );
      setNotice("阅读位置已保存");
      progress.reload();
      recordStudy({
        platform: "math",
        type: "reading",
        title: `${mathTitle(album)} · ${mathTitle(catalog)}`,
        path: "/study/resources",
      });
    } catch (e: any) {
      setNotice(`阅读位置保存失败：${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const goQuestion = (row: MathRow) => {
    if (row.QuestionID) {
      void saveReading(row.ID);
      onQuestion(row);
    }
  };
  if (catalog && album) {
    const nodes = mathRows(items.data);
    return (
      <div className="math-workspace">
        <button
          className="math-back"
          onClick={() => {
            setCatalog(undefined);
            setNotice("");
          }}
        >
          <ArrowLeft size={16} />
          返回{mathTitle(album)}目录
        </button>
        <div className="math-section-heading">
          <div>
            <span className="eyebrow">CHAPTER READING</span>
            <h2>{mathTitle(catalog)}</h2>
            <p>{mathTitle(album)} · 图文、例题与视频一起学</p>
          </div>
        </div>
        <div className="panel math-album-reading">
          <Status
            loading={items.loading}
            error={items.error}
            empty={!items.loading && !nodes.length}
            retry={items.reload}
          />
          <AlbumContent
            rows={contentTree(nodes)}
            onQuestion={goQuestion}
            onPosition={saveReading}
            onPractice={setPractice}
          />
          {notice && (
            <p className="math-account-notice" role="status">
              {notice}
            </p>
          )}
          <div className="math-album-reading-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !nodes.length}
              onClick={() => saveReading(nodes[0]?.ID || catalog.ID)}
            >
              <Check size={16} />
              {busy ? "保存中…" : "保存阅读位置"}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (album)
    return (
      <div className="math-workspace">
        <button className="math-back" onClick={() => setAlbum(undefined)}>
          <ArrowLeft size={16} />
          返回全部专辑
        </button>
        <div className="math-section-heading">
          <div>
            <span className="eyebrow">COLLECTION CHAPTERS</span>
            <h2>{mathTitle(album)}</h2>
            <p>{album.Notes || album.Remark || "按专题章节系统学习"}</p>
          </div>
          <button
            className="btn btn-secondary"
            disabled={
              busy ||
              profile.loading ||
              !!profile.error ||
              !currentProfile.ID
            }
            onClick={toggleShelf}
          >
            {mine.includes(String(album.ID)) ? "移出我的专辑" : "加入我的专辑"}
          </button>
        </div>
        <div className="panel">
          <Status
            loading={info.loading}
            error={info.error || profile.error}
            retry={() => {
              info.reload();
              profile.reload();
            }}
          />
          {notice && (
            <p className="math-account-notice" role="status">
              {notice}
            </p>
          )}
          <Status
            loading={chapters.loading}
            error={chapters.error}
            empty={!chapters.loading && !mathRows(chapters.data).length}
            retry={chapters.reload}
          />
          <div className="math-content-list">
            {mathRows(chapters.data).map((c, i) => (
              <button
                key={c.ID || i}
                onClick={() => setCatalog(c)}
              >
                <div className="math-list-icon">
                  <BookOpen size={20} />
                </div>
                <span>
                  <strong>{mathTitle(c)}</strong>
                  <small>{c.Type || "章节内容"}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  const groups = groupMathAlbums(mathRows(albums.data)).map(group => ({ ...group, rows: group.rows.filter(r => (!myOnly || mine.includes(String(r.ID))) && (!query || mathTitle(r).includes(query))) })).filter(group => group.rows.length && (stageFilter === "全部阶段" || group.name === stageFilter));
  const visible = groups.flatMap(group => group.rows);
  return (
    <div className="math-workspace">
      <div className="panel">
        <div className="math-toolbar">
          <div className="tabs">
            {[false, true].map((own) => (
              <button
                key={String(own)}
                className={myOnly === own ? "active" : ""} aria-pressed={myOnly === own}
                onClick={() => setMyOnly(own)}
              >
                {own ? "我的专辑" : "全部专辑"}
              </button>
            ))}
          </div>
          <label className="math-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索数学专辑…"
              aria-label="搜索数学专辑"
            />
          </label>
        </div>
        <div className="math-album-stages" aria-label="专辑备考阶段">
          {["全部阶段", ...mathStages.map(s => s.name), "专题拓展"].map(name => <button key={name} className={stageFilter === name ? "active" : ""} aria-pressed={stageFilter === name} onClick={() => setStageFilter(name)}>{name}{name === stage ? <small>当前阶段</small> : null}</button>)}
        </div>
        <Status
          loading={albums.loading}
          error={albums.error}
          empty={!albums.loading && !visible.length}
          retry={albums.reload}
        />
        <div className="math-album-sections">{groups.map(group => <section key={group.name} className="math-album-stage-section"><div className="math-album-stage-heading"><h3>{group.name}阶段{group.name === stage && <span className="math-tag">正在学习</span>}</h3><p>{mathStages.find(s => s.name === group.name)?.description || "围绕专项难点，按需深入学习"} · {group.rows.length} 个专辑</p></div><div className="math-album-grid">
          {group.rows.map((a, i) => (
            <button
              key={a.ID || i}
              className="math-album-card"
              onClick={() => setAlbum(a)}
            >
              {mathImage(a.HeadImg || a.IntroImg) ? (
                <img
                  src={mathImage(a.HeadImg || a.IntroImg)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <div className={`math-album-cover math-cover-${i % 4}`}>
                  <BookOpen size={34} />
                </div>
              )}
              <div>
                <span className="math-tag">数学专辑</span>
                <h3>{mathTitle(a)}</h3>
                <p>{a.Notes || a.Remark || "按章节系统学习"}</p>
                <span className="math-book-link">
                  进入专辑
                  <ArrowRight size={14} />
                </span>
              </div>
            </button>
          ))}
        </div></section>)}</div>
      </div>
    </div>
  );
}
function AlbumContent({
  rows,
  onQuestion,
  onPosition,
  onPractice,
}: {
  rows: MathRow[];
  onQuestion: (r: MathRow) => void;
  onPosition: (id: number | string) => Promise<void>;
  onPractice?: (r: MathRow) => void;
}) {
  return (
    <>
      {rows.map((r, i) => (
        <article className="math-album-content" key={r.ID || i}>
          {r.Title && <h4>{r.Title}</h4>}
          <MathQuestionStem content={r.QuestionTxt || r.Content} image={mathImage(r.QuestionImg)} emptyText="" />
          {(r.PlayVid || r.BusType === "视频") && (
            <MathQuestionVideo
              row={{ ...r, PolyvVID: r.PlayVid || r.BusValue }}
            />
          )}
          {(r._question_files || [])
            .filter(
              (f: MathRow) =>
                f.BusType === "视频解析" || f.Type === "视频" || f.PlayVid,
            )
            .map((f: MathRow, j: number) => (
              <MathQuestionVideo
                key={f.ID || j}
                row={{ ...f, PolyvVID: f.PlayVid || f.BusValue }}
                origin={f.QuestionID || r.QuestionID ? { kind: "analysis", questionId: f.QuestionID || r.QuestionID, ...(f.ID ? { itemId: f.ID } : {}) } : undefined}
              />
            ))}
          {fileLinks(r).map((url, j) => (
            <a
              className="math-file-link"
              href={url}
              key={j}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={16} />
              打开相关资料 {j + 1}
            </a>
          ))}
          {r.QuestionID && (
            <button className="btn btn-secondary" onClick={() => onQuestion(r)}>
              查看题目与解析
              <ArrowRight size={14} />
            </button>
          )}
          {!r.QuestionID &&
            ["习题", "题目"].includes(r.Type) &&
            r.children?.some((c: MathRow) => c.QuestionID) && (
              <div className="math-answer-actions">
                <span className="math-tag">本节习题组</span>
                {onPractice && (
                  <button
                    className="btn btn-primary"
                    onClick={() => onPractice(r)}
                  >
                    逐题训练并记录掌握情况
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          {Array.isArray(r.children) && r.children.length > 0 && (
            <div className="math-album-content-nested">
              <AlbumContent
                rows={r.children}
                onQuestion={onQuestion}
                onPosition={onPosition}
                onPractice={onPractice}
              />
            </div>
          )}
          {Array.isArray(r.ContentList) && r.ContentList.length > 0 && (
            <AlbumContent
              rows={contentTree(r.ContentList)}
              onQuestion={onQuestion}
              onPosition={onPosition}
              onPractice={onPractice}
            />
          )}
        </article>
      ))}
    </>
  );
}
