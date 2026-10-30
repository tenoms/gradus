export default function ImportedReportSummary({ record }: { record: Record<string, any> }) {
  const value = (...keys: string[]) => keys.map(key => record[key]).find(item => item !== undefined && item !== null && item !== "");
  const fields = [
    ["得分", value("score", "Score", "TotalScore", "totalScore")],
    ["题目数", value("exerciseTotalNumber", "QuestionCount", "questionCount", "sumcount")],
    ["正确数", value("correctNumber", "RightCount", "rightCount")],
    ["错误数", value("incorrectNumber", "inCorrectNumber", "ErrorCount")],
    ["记录时间", value("submitTime", "endTime", "createDate", "AddTime", "addTime")],
  ].filter(([, item]) => item !== undefined);
  return <section className="settings-panel">
    <p className="muted">小程序导入 · 历史报告摘要</p>
    <h3>{String(value("examinationName", "examName", "Name", "name", "Title") || "小程序学习报告").replace(/<[^>]*>/g," ")}</h3>
    <p>此报告保留了小程序中的成绩与完成状态，暂不包含逐题作答详情。</p>
    <dl className="personal-form-grid">{fields.map(([label, item]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{String(item)}</dd></div>)}</dl>
  </section>;
}
