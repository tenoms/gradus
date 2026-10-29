import {
  ArrowDownToLine,
  ArrowRight,
  ChartNoAxesCombined,
  Code2,
  Sigma,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Platform } from "../../../shared/api/client";
import Pagination from "../../../shared/ui/pagination/Pagination";
import { usePagination } from "../../../shared/ui/pagination/use-pagination";
import WeeklyChart from "../dashboard/WeeklyChart";
import { exportStudyData, useStudyData } from "../state/store";
import { platformLabel as label } from "../study-format";

export default function StudyInsights() {
  const { activities, tasks } = useStudyData();
  const listRef = useRef<HTMLElement>(null);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityPlatform, setActivityPlatform] = useState("all");
  const visibleActivities = activities.filter(activity => (activityPlatform === "all" || activity.platform === activityPlatform) && activity.title.toLowerCase().includes(activitySearch.trim().toLowerCase()));
  const pagination = usePagination({ total: visibleActivities.length, resetKey: `${activityPlatform}:${activitySearch}` });
  const total = activities.reduce((n, a) => n + (a.total || 0), 0);
  const correct = activities.reduce((n, a) => n + (a.correct || 0), 0);
  const graded = activities
    .filter((a) => a.correct !== undefined)
    .reduce((n, a) => n + (a.total || 0), 0);
  const days = new Set(
    activities.map((a) =>
      new Date(a.at).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
    ),
  ).size;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1 className="sr-only">学习报告</h1>
        </div>
        <button className="btn btn-secondary" onClick={exportStudyData}>
          <ArrowDownToLine size={16} />
          导出记录
        </button>
      </div>
      <div className="stat-grid insights-stats">
        {[
          ["累计练习", total, "题"],
          [
            "已批改正确率",
            graded ? Math.round((correct / graded) * 100) : 0,
            "%",
          ],
          ["学习天数", days, "天"],
          ["完成计划", tasks.filter((t) => t.done).length, "项"],
        ].map(([name, num, unit]) => (
          <div className="stat-card" key={name}>
            <span className="muted">{name}</span>
            <div className="stat-number">
              {num}
              <small>{unit}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="insights-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>本周学习节奏</h2>
            <span className="subtle">按真实学习活动统计</span>
          </div>
          <WeeklyChart />
        </section>
        <section className="panel subject-summary">
          <h2>学科分布</h2>
          {(["math", "computer"] as Platform[]).map((p) => (
            <div className="subject-row" key={p}>
              <span className={`path-icon ${p === "math" ? "violet" : "mint"}`}>
                {p === "math" ? <Sigma /> : <Code2 />}
              </span>
              <div>
                <strong>{label(p)}</strong>
                <span>
                  {activities.filter((a) => a.platform === p).length} 次学习活动
                </span>
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel pagination-content" ref={listRef}>
        <div className="section-heading">
          <h2>学习足迹</h2>
          <span className="subtle">
            全部 {activities.length} 条活动
          </span>
        </div>
        <div className="records-filters"><input className="input" aria-label="搜索学习足迹" placeholder="搜索学习内容" value={activitySearch} onChange={event => setActivitySearch(event.target.value)} /><select className="input" aria-label="按学科筛选学习足迹" value={activityPlatform} onChange={event => setActivityPlatform(event.target.value)}><option value="all">全部学科</option><option value="math">考研数学</option><option value="computer">计算机 408</option></select></div>
        {visibleActivities.length ? (
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th>学习内容</th>
                  <th>科目</th>
                  <th>题目数</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {visibleActivities.slice(pagination.start, pagination.end).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={a.path || "/study/practice"}>{a.title}</Link>
                    </td>
                    <td>{label(a.platform)}</td>
                    <td>{a.total ?? "—"}</td>
                    <td>
                      {new Date(a.at).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <ChartNoAxesCombined size={35} />
            <h3>{activities.length ? "没有符合条件的学习活动" : "积累，正在发生"}</h3>
            <p>{activities.length ? "调整关键词或学科筛选后再试。" : "完成你的第一组练习，开始记录学习进步。"}</p>
            <Link className="btn btn-primary" to="/study/practice">
              开始练习
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
        <Pagination page={pagination.page} pageSize={pagination.pageSize} total={visibleActivities.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} label="学习足迹" contentRef={listRef} />
      </section>
      <p className="footnote">
        此报告汇总在 Web
        中产生的学习活动；答案、笔记和复习记录归当前学习账号所有。
      </p>
    </>
  );
}
