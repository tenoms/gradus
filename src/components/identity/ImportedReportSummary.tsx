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
    <h3>{String(value("examinationName", "examName", "Name", "name", "Title") || "原平台学习报告").replace(/<[^>]*>/g," ")}</h3>
    <p>保留原平台已有成绩与状态。此记录尚未包含完整逐题答卷；开始新练习后，新的作答会独立保存在 Web。</p>
    <dl className="personal-form-grid">{fields.map(([label, item]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{String(item)}</dd></div>)}</dl>
  </section>;
}
