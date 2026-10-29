import { mathBookLabels } from "./math-library";
import type { MathRow } from "../api/math";
import "./math-book-labels.css";

export default function MathBookLabels({ book }: { book: MathRow }) {
  return <div className="math-book-labels">
    {mathBookLabels(book).map(({ kind, label }) => <span key={label} className={`math-book-label math-book-label-${kind}`}>{label}</span>)}
  </div>;
}
