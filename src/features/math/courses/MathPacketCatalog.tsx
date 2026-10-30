import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, FileText, LoaderCircle, Play, RefreshCw, Search, X } from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { mathRows } from "../api/math";
import type { MathRow as Row } from "../api/math";
import { courseApi, courseLabel, courseLinks } from "./math-courses";
import { taskType } from "./course-model.mjs";
import { packetCatalogChapters, packetChapterRequestID } from "./packet-catalog-model.mjs";
import type { PacketCatalogNode } from "./packet-catalog-model.mjs";
import "./math-packet-catalog.css";

function flatten(nodes: PacketCatalogNode[]): Row[] {
  return nodes.flatMap(({ row, children }) => [row, ...flatten(children)]);
}
function leaves(nodes: PacketCatalogNode[]): Row[] {
  return nodes.flatMap(({ row, children }) => children.length ? leaves(children) : [row]);
}
function matches(node: PacketCatalogNode, query: string): boolean {
  return String(node.row._searchText || courseLabel(node.row)).toLocaleLowerCase().includes(query) || node.children.some((child) => matches(child, query));
}

export default function MathPacketCatalog({
  rows, packetID, productID, stuid, selectedID, onSelect, onOpen, opening, lastEntryID,
}: {
  rows: Row[];
  packetID: number | string;
  productID: number | string;
  stuid: string;
  selectedID?: number | string;
  onSelect: (row: Row) => void;
  onOpen: (row: Row) => void;
  opening: boolean;
  lastEntryID?: number | string;
}) {
  const tree = useMemo(() => packetCatalogChapters(rows, packetID), [rows, packetID]),
    chapters = useMemo(() => leaves(tree), [tree]),
    selected = chapters.find((row) => String(row.ID) === String(selectedID)) || chapters[0],
    [search, setSearch] = useState(""),
    [mobileOpen, setMobileOpen] = useState(false),
    [sections, setSections] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const query = search.trim().toLocaleLowerCase(),
    isCourse = Number(selected?.CourseID || 0) !== 0,
    requestID = selected ? packetChapterRequestID(rows, selected) : undefined;
  useEffect(() => {
    if (!selected) return;
    if (String(selected.ID) !== String(selectedID)) onSelect(selected);
  }, [selected?.ID, selectedID]);
  useEffect(() => {
    let active = true;
    setSections([]);
    setError("");
    if (!selected || isCourse) {
      setLoading(false);
      return;
    }
    setLoading(true);
    courseApi.packetChapter(stuid, productID, packetID, requestID!)
      .then((response) => { if (active) setSections(mathRows(response)); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [stuid, productID, packetID, selected?.ID, requestID, version]);

  const target = sections.find((row) => String(row.ID) === String(selected?.ID)),
    visible = isCourse ? [{ ...selected, _c_course_packet: [selected] }] : target ? [target]
      : selected && sections.length && sections.every((row) => Number(row.CourseID || 0) !== 0) ? [{ ...selected, _c_course_packet: sections }] : [],
    entryCount = visible.reduce((sum, section) => sum + (section._c_course_packet || []).length, 0),
    parent = flatten(tree).find((row) => String(row.ID) === String(selected?.PID));

  function navigation(nodes: PacketCatalogNode[], ancestorMatches = false) {
    return nodes.filter((node) => !query || ancestorMatches || matches(node, query)).map(({ row, children }) => {
      const fullGroup = ancestorMatches || courseLabel(row).toLocaleLowerCase().includes(query);
      return children.length ? (
        <details className="mpc-group" key={`${row.ID}-${query ? "search" : "browse"}`} open={!!query || leaves(children).some((child) => String(child.ID) === String(selected?.ID))}>
          <summary><ChevronRight size={16} /><span>{courseLabel(row)}</span><small>{leaves(children).length}</small></summary>
          <div className="mpc-nav-children">{navigation(children, fullGroup)}</div>
        </details>
      ) : (
        <button key={row.ID} className={`mpc-chapter ${String(row.ID) === String(selected?.ID) ? "active" : ""}`}
          aria-current={String(row.ID) === String(selected?.ID) ? "true" : undefined}
          onClick={() => { onSelect(row); setMobileOpen(false); }}>
          <span className="mpc-chapter-number"><BookOpen size={14} /></span>
          <span className="mpc-chapter-name">{courseLabel(row)}</span><ChevronRight size={14} />
        </button>
      );
    });
  }

  return (
    <div className="mpc-layout">
      <aside className={`panel mpc-nav ${mobileOpen ? "is-open" : ""}`} aria-label="课程包章节">
        <div className="mpc-nav-heading"><h3>章节目录</h3><small>{chapters.length} 个章节</small><button className="mpc-mobile-toggle" aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? "收起目录" : "切换章节"}<ChevronRight size={15} /></button></div>
        <label className="mpc-search"><Search size={16} /><input aria-label="搜索章节或模块" placeholder="搜索章节或模块" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button type="button" aria-label="清除章节搜索" onClick={() => setSearch("")}><X size={14} /></button>}
        </label>
        <nav className="mpc-navigation" aria-label="选择章节">
          {navigation(tree)}
          {query && !tree.some((node) => matches(node, query)) && <div className="mpc-empty"><p>没有找到相关章节</p><button className="btn btn-secondary" onClick={() => setSearch("")}>清除搜索</button></div>}
        </nav>
      </aside>
      <section className="panel mpc-content" aria-label="当前章节内容" aria-busy={loading}>
        <div className="mpc-content-heading">
          <div><p className="mpc-breadcrumb">{parent ? courseLabel(parent) : "课程目录"}</p><h3>{selected ? courseLabel(selected) : "课程内容"}</h3>
            <p className="mpc-subtitle">{loading ? "正在加载章节内容…" : error ? "章节内容暂未加载" : `共 ${entryCount} 个学习条目`}</p>
          </div>
          {selected && !isCourse && <button className="btn btn-secondary" disabled={loading} onClick={() => setVersion((n) => n + 1)} aria-label="刷新当前章节"><RefreshCw size={14} />刷新</button>}
        </div>
        {loading ? <div className="mpc-status" role="status"><LoaderCircle className="spin" size={20} />正在加载章节内容…</div>
          : error ? <div className="mpc-status mc-error" role="alert">{error}<button className="btn btn-secondary" onClick={() => setVersion((n) => n + 1)}>重试</button></div>
          : <div className="mpc-sections">
            {visible.map((section) => <section className="mpc-section" key={section.ID}>
              {visible.length > 1 && <header><h4>{courseLabel(section)}</h4><small>{(section._c_course_packet || []).length} 个条目</small></header>}
              {section.Notes && <div className="mpc-notes"><RichContent content={section.Notes} /></div>}
              <ol className="mpc-lessons">{(section._c_course_packet || []).map((entry: Row, index: number) => {
                const details: Row[] = entry._c_course_list?._c_course_calendar_detail || [],
                  kinds = [...new Set(details.map((detail) => Number(detail.BusType) === 8 ? "学习专辑" : taskType(detail)))],
                  files = [...new Map([entry, ...details.map((detail) => detail._Paper || {})].flatMap(courseLinks).map((file) => [file.url, file])).values()],
                  recent = String(entry.ID) === String(lastEntryID),
                  isVideo = kinds.length === 1 && kinds[0] === "录播";
                return <li className="mpc-lesson" key={entry.ID || index}>
                  <button className="mpc-lesson-open" disabled={opening} onClick={() => onOpen(entry)}>
                    <span className="mpc-lesson-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="mpc-lesson-icon">{isVideo ? <Play size={18} /> : <BookOpen size={18} />}</span>
                    <span className="mpc-lesson-copy"><span className="mpc-lesson-meta">{kinds.map((kind) => <small className="mpc-kind" key={kind}>{kind}</small>)}{recent && <small className="mpc-kind mpc-recent">上次学到</small>}</span>
                      <strong>{courseLabel(entry)}</strong>
                      {details.length > 1 && <small className="mpc-lesson-description">{details.length} 项学习任务</small>}
                    </span>
                    <span className="mpc-lesson-action">进入学习<ChevronRight size={15} /></span>
                  </button>
                  {files.length > 0 && <div className="mpc-downloads">{files.map((file, i) => <a className="mpc-download" key={file.url} href={file.url} target="_blank" rel="noreferrer" title={file.name} aria-label={`查看讲义：${courseLabel(entry)} · ${file.name}`}><FileText size={15} />{files.length > 1 ? `讲义 ${i + 1}` : "讲义"}</a>)}</div>}
                </li>;
              })}</ol>
            </section>)}
            {!entryCount && <div className="mpc-empty"><BookOpen size={30} /><h4>本章暂无学习条目</h4><p>可以选择其他章节，或刷新查看最新内容。</p></div>}
          </div>}
      </section>
    </div>
  );
}
