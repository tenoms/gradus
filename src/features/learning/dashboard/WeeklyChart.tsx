import { useStudyData } from "../state/store";
import type { Activity } from "../state/store";
import type { Platform } from "../../../shared/api/client";
import { formatStudyDuration, studyTrend } from "../study-summary.mjs";
import "./study-statistics.css";

export default function WeeklyChart({ activities: supplied, platform, rangeDays = 7, metric = "activities", now }: {
  activities?: Activity[]; platform?: Platform; rangeDays?: number;
  metric?: "duration" | "questions" | "activities"; now?: string | number | Date;
} = {}) {
  const { activities: stored } = useStudyData();
  const week = studyTrend(supplied || stored, { days: rangeDays, platform, metric, now });
  const dates = week.map(day => day.date);
  const counts = week.map(day => day.count);
  const max = Math.max(metric === "duration" ? 60 : 5, ...counts);
  const unit = metric === "duration" ? "时长" : metric === "questions" ? "作答量" : "活动次数";
  const display = (count: number) => metric === "duration" ? formatStudyDuration(count) : `${count}${metric === "questions" ? "题" : "次"}`;
  return (
    <div
      className={`weekly-chart study-trend ${rangeDays > 7 ? "is-dense" : ""}`}
      role="img"
      aria-label={`最近${rangeDays}天${unit}：${dates.map((date, i) => `${date} ${display(counts[i])}`).join("，")}`}
    >
      <div className="chart-grid">
        <span>{unit}</span>
        <div />
        <div />
        <div />
      </div>
      <div className="bars">
        {dates.map((date, i) => (
          <div className="bar-col" key={date}>
            <div
              className={`bar ${i === dates.length - 1 ? "current" : ""}`}
              style={{
                height: `${Math.max(counts[i] ? 5 : 2, (counts[i] / max) * 100)}%`,
              }}
              title={`${date}：${display(counts[i])}`}
            >
              <span>{display(counts[i])}</span>
            </div>
            <small>{rangeDays <= 7 || i % 5 === 0 || i === rangeDays - 1 ? date.slice(5).replace("-", "/") : ""}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
