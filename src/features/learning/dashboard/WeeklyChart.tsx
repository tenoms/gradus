import { useStudyData } from "../state/store";

export default function WeeklyChart() {
  const { activities } = useStudyData();
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  });
  const counts = dates.map((d) =>
    activities
      .filter(
        (a) =>
          new Date(a.at).toLocaleDateString("sv-SE", {
            timeZone: "Asia/Shanghai",
          }) === d,
      )
      .reduce((n, a) => n + (a.total || 1), 0),
  );
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
