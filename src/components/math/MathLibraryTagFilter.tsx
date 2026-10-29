import "./MathLibraryTagFilter.css";

export default function MathLibraryTagFilter({
  kind,
  options,
  value,
  onChange,
}: {
  kind: string;
  options: { label: string; count: number }[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (!options.length && !value) return null;
  const label = kind === "教辅" ? "教辅标签" : kind === "真题" ? "试卷分类" : "资料标签";
  const allLabel = kind === "教辅" ? "全部教辅" : kind === "真题" ? "全部试卷" : "全部标签";
  const visible = value && !options.some(option => option.label === value)
    ? [...options, { label: value, count: 0 }]
    : options;
  return <div className="math-library-tag-filter" role="group" aria-label={label}>
    <span className="math-library-tag-caption">{label}</span>
    <div className="math-library-tag-options">
      <button type="button" className={!value ? "active" : ""} aria-pressed={!value} onClick={() => onChange("")}>
        {allLabel}<span>{options.reduce((sum, option) => sum + option.count, 0)}</span>
      </button>
      {visible.map(option => <button type="button" key={option.label} className={value === option.label ? "active" : ""} aria-pressed={value === option.label} onClick={() => onChange(option.label)}>
        {option.label}<span>{option.count}</span>
      </button>)}
    </div>
  </div>;
}
