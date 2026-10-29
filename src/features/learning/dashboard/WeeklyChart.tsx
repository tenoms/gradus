import { useStudyData } from "../state/store";
import { studyWeek } from "../study-summary.mjs";

export default function WeeklyChart() {
  const { activities } = useStudyData();
  const week = studyWeek(activities);
  const dates = week.map(day => day.date);
  const counts = week.map(day => day.count);
  const max = Math.max(5, ...counts);
  return (
    <div
      className="weekly-chart"
      role="img"
      aria-label={`最近7天学习活动：${dates.map((date, i) => `${date} ${counts[i]}次`).join("，")}`}
    >
      <div className="chart-grid">
        <span>次数</span>
        <div />
        <div />
        <div />
      </div>
      <div className="bars">
        {dates.map((date, i) => (
          <div className="bar-col" key={date}>
            <div
              className={`bar ${i === 6 ? "current" : ""}`}
              style={{
                height: `${Math.max(counts[i] ? 5 : 2, (counts[i] / max) * 100)}%`,
              }}
              title={`${date}：${counts[i]} 次学习活动`}
            >
              <span>{counts[i]}</span>
            </div>
            <small>{date.slice(5).replace("-", "/")}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
