import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen, ChevronRight, FileText, Search, X } from "lucide-react";
import type { MathRow as Row } from "../api/math";
import { MathCoursePaper } from "../exams/MathExams";
import MathCourseAlbum from "./MathCourseAlbum";
import { packetAssignmentGroups } from "./packet-assignment-model.mjs";
import type { PacketAssignmentEntry, PacketAssignmentGroup } from "./packet-assignment-model.mjs";
import "./math-packet-assignments.css";

const actionLabel = (assignment: PacketAssignmentEntry) => assignment.status === "completed"
  ? "回看作业" : assignment.status === "grading" ? "查看作业" : assignment.status === "in-progress" ? "继续作业" : "开始作业";
const assignmentsOf = (group: PacketAssignmentGroup) => group.chapters.flatMap((chapter) => chapter.modules.flatMap((module) => module.assignments));

export default function MathPacketAssignments({ tasks, treeRows, packetID, productID, stuid, loading, onReload }: {
  tasks: Row[];
  treeRows: Row[];
  packetID: number | string;
  productID: number | string;
  stuid: string;
  loading: boolean;
  onReload: () => void;
}) {
  const groups = useMemo(() => packetAssignmentGroups(tasks, treeRows, packetID), [tasks, treeRows, packetID]),
    [subjectID, setSubjectID] = useState("default"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [expanded, setExpanded] = useState<Record<string, boolean>>({}),
    [opened, setOpened] = useState<{ task: Row; title: string; path: string; assignment?: PacketAssignmentEntry }>(),
    [albumPaper, setAlbumPaper] = useState<Row>();
  const all = groups.flatMap(assignmentsOf),
    completed = all.filter((assignment) => assignment.status === "completed").length,
    query = search.trim().toLocaleLowerCase(),
    selectedSubject = subjectID === "default" ? groups.find((group) => assignmentsOf(group).length)?.id || "all"
      : groups.some((group) => group.id === subjectID) ? subjectID : "all";
  const visible = groups.filter((group) => selectedSubject === "all" || group.id === selectedSubject).map((group) => ({
    ...group,
    chapters: group.chapters.map((chapter) => ({
      ...chapter,
      modules: chapter.modules.map((module) => {
        const pathMatches = `${group.title} ${chapter.title} ${module.title}`.toLocaleLowerCase().includes(query),
          assignments = module.assignments.filter((assignment) => (status === "all" || status === assignment.status) &&
            (!query || pathMatches || assignment.title.toLocaleLowerCase().includes(query)));
        return { ...module, assignments, visible: assignments.length > 0 || module.assignments.length === 0 && status === "all" && (!query || pathMatches) };
      }).filter((module) => module.visible),
    })).filter((chapter) => chapter.modules.length),
  })).filter((group) => group.chapters.length);
  const visibleAssignments = visible.flatMap(assignmentsOf),
    firstChapter = visible.flatMap((group) => group.chapters).find((chapter) => chapter.modules.some((module) => module.assignments.length))?.id || visible[0]?.chapters[0]?.id;

  function closeReader() {
    setOpened(undefined);
    setAlbumPaper(undefined);
    onReload();
  }
  if (opened) {
    const paper = albumPaper || opened.assignment?.row,
      task = opened.task;
    return <div className="mpa-reader">
      {!paper && <button className="mpa-back" onClick={closeReader}><ArrowLeft size={16} />返回课程作业</button>}
      <p>{opened.path}</p>
      {!paper && <h3>{opened.title}</h3>}
      {paper ? <MathCoursePaper
        stuid={stuid}
        PaperID={Number(paper.BusID || paper.PaperID || paper._c_paper?.ID || paper.ID)}
        CourseID={task.CourseID ?? packetID}
        CalendarID={task.CalendarID ?? 0}
        ProductID={task.ProductID ?? productID}
        isTeacher={albumPaper ? Number(albumPaper.BusType) === 6 : opened.assignment?.isTeacher}
        isAbility={Number(paper.BusType) === 9}
        backLabel="返回课程作业"
        onClose={() => { if (albumPaper) { setAlbumPaper(undefined); onReload(); } else closeReader(); }}
      /> : <MathCourseAlbum
        stuid={stuid}
        AlbumID={task.BusID}
        CourseID={task.CourseID ?? packetID}
        CalendarID={task.CalendarID ?? 0}
        ProductID={task.ProductID ?? productID}
        onPaper={setAlbumPaper}
      />}
    </div>;
  }

  return <section className="panel mpa-workspace" aria-label="课程作业分组">
    <div className="mpa-heading">
      <div><h3>课程作业</h3><p>按学科、章节和模块整理，选择作业即可进入。</p></div>
      <div className="mpa-overview"><span>共 <strong>{all.length}</strong> 份作业</span><span>已完成 <strong>{completed}</strong> 份</span></div>
    </div>
    <div className="mpa-subject-tabs" role="group" aria-label="作业学科">
      <button aria-pressed={selectedSubject === "all"} onClick={() => setSubjectID("all")}>全部<small>{all.length}</small></button>
      {groups.map((group) => <button key={group.id} aria-pressed={selectedSubject === group.id} onClick={() => setSubjectID(group.id)}>{group.title}<small>{assignmentsOf(group).length}</small></button>)}
    </div>
    <div className="mpa-toolbar">
      <label className="mpa-search"><Search size={16} /><input aria-label="搜索课程作业" placeholder={selectedSubject === "all" ? "搜索章节、模块或作业名称" : "搜索当前学科作业或模块"} value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button aria-label="清除作业搜索" onClick={() => setSearch("")}><X size={15} /></button>}</label>
      <label className="mpa-filter">完成状态<select aria-label="筛选作业状态" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="all">全部状态</option><option value="pending">未开始</option><option value="in-progress">进行中</option><option value="grading">待批阅</option><option value="completed">已完成</option>
      </select></label>
    </div>
    <p className="mpa-result-count" role="status">{loading ? "正在读取课程作业…" : `当前显示 ${visibleAssignments.length} 份作业，${visible.reduce((sum, group) => sum + group.chapters.length, 0)} 个章节`}</p>
    {visible.map((group) => <section className="mpa-subject" key={group.id}>
      <header><h3>{group.title}</h3><small>{assignmentsOf(group).length} 份作业</small></header>
      {group.chapters.map((chapter) => {
        const assignments = chapter.modules.flatMap((module) => module.assignments),
          finished = assignments.filter((assignment) => assignment.status === "completed").length,
          expandedKey = `${selectedSubject}:${query}:${status}:${chapter.id}`,
          open = expanded[expandedKey] ?? (!!query || status !== "all" || chapter.id === firstChapter);
        return <details className="mpa-chapter" key={expandedKey} open={open} onToggle={(event) => {
          const value = event.currentTarget.open;
          setExpanded((previous) => previous[expandedKey] === value ? previous : { ...previous, [expandedKey]: value });
        }}>
          <summary><ChevronRight size={17} /><span className="mpa-chapter-title"><strong>{chapter.title}</strong><small>{chapter.modules.length} 个模块 · {assignments.length} 份作业</small></span><span className="mpa-chapter-progress">已完成 {finished}/{assignments.length}</span></summary>
          <div className="mpa-modules">{chapter.modules.map((module) => <section className="mpa-module" key={module.id}>
            <header><h4>{module.title}</h4><small>{module.assignments.length} 份作业</small></header>
            {module.assignments.map((assignment) => <button className="mpa-assignment" key={assignment.id} onClick={() => setOpened({ task: module.task, title: assignment.title, path: `${group.title} / ${chapter.title} / ${module.title}`, assignment })}>
              <FileText size={19} /><span className="mpa-assignment-copy"><strong>{assignment.title}</strong><small>{assignment.isTeacher ? "人工评阅" : "自评作业"}{assignment.score !== undefined ? ` · ${assignment.score} 分` : ""}</small></span>
              <span className="mpa-state" data-state={assignment.status}>{assignment.statusLabel}</span><span className="mpa-assignment-action">{actionLabel(assignment)}<ChevronRight size={15} /></span>
            </button>)}
            {!module.assignments.length && <div className="mpa-module-empty"><p>本模块暂无独立作业</p><button className="btn btn-secondary" onClick={() => setOpened({ task: module.task, title: module.title, path: `${group.title} / ${chapter.title}` })}><BookOpen size={15} />查看课程专辑</button></div>}
          </section>)}</div>
        </details>;
      })}
    </section>)}
    {!loading && !visible.length && <div className="mpa-empty"><FileText size={28} /><h4>{tasks.length ? "没有符合条件的作业" : "当前课程包暂无作业"}</h4><p>{tasks.length ? "可以切换学科、调整完成状态或清除搜索。" : "课程发布作业后会显示在这里。"}</p>{tasks.length > 0 && <button className="btn btn-secondary" onClick={() => { setSearch(""); setStatus("all"); setSubjectID("all"); }}>重置筛选</button>}</div>}
  </section>;
}
