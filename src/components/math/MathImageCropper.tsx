import { useEffect, useRef, useState } from "react";
import { Crop, RotateCcw, RotateCw } from "lucide-react";
import { cropImageFile, normalizedCrop } from "../../platforms/math-image";
import type { CropBox } from "../../platforms/math-image";
import "./math-photo.css";
export default function MathImageCropper({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const [workingFile, setWorkingFile] = useState(file);
  const [box, setBox] = useState<CropBox>({ x: 0, y: 0, width: 1, height: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const frame = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    const value = URL.createObjectURL(workingFile);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [workingFile]);
  const coordinates = (e: React.PointerEvent) => {
    const rect = frame.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };
  const rotate = async (degrees: number) => {
    setBusy(true);
    setError("");
    try {
      const next = await cropImageFile(
        workingFile,
        { x: 0, y: 0, width: 1, height: 1 },
        degrees,
      );
      setWorkingFile(next);
      setBox({ x: 0, y: 0, width: 1, height: 1 });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      onConfirm(await cropImageFile(workingFile, box));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const adjust = (key: keyof CropBox, value: number) => {
    setBox((previous) => {
      const next = { ...previous, [key]: value / 100 };
      next.x = Math.min(0.99, Math.max(0, next.x));
      next.y = Math.min(0.99, Math.max(0, next.y));
      next.width = Math.max(0.01, Math.min(1 - next.x, next.width));
      next.height = Math.max(0.01, Math.min(1 - next.y, next.height));
      return next;
    });
  };
  return (
    <div className="math-image-cropper">
      <p>拖动框选一道完整题目，去掉多余背景后识别效果更好。</p>
      <div
        className="math-crop-frame"
        ref={frame}
        onPointerDown={(e) => {
          start.current = coordinates(e);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current)
            setBox(normalizedCrop(start.current, coordinates(e)));
        }}
        onPointerUp={(e) => {
          if (start.current) {
            const next = normalizedCrop(start.current, coordinates(e));
            if (next.width > 0.02 && next.height > 0.02) setBox(next);
            start.current = undefined;
          }
        }}
        onPointerCancel={() => {
          start.current = undefined;
        }}
      >
        <img src={url} alt="拖动选择数学题目区域" draggable={false} />
        <div
          className="math-crop-selection"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
          }}
        />
      </div>
      <div className="math-crop-ranges">
        {(
          [
            ["x", "左边界"],
            ["y", "上边界"],
            ["width", "宽度"],
            ["height", "高度"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label} {Math.round(box[key] * 100)}%
            <input
              type="range"
              min={key === "x" || key === "y" ? 0 : 1}
              max={key === "x" || key === "y" ? 99 : 100}
              step={1}
              value={Math.round(box[key] * 100)}
              onChange={(e) => adjust(key, Number(e.target.value))}
              aria-label={`裁切${label}`}
            />
          </label>
        ))}
      </div>
      <div className="math-crop-controls">
        <button
          className="btn btn-secondary"
          onClick={() => rotate(-90)}
          disabled={busy}
        >
          <RotateCcw size={15} />
          向左旋转
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => rotate(90)}
          disabled={busy}
        >
          <RotateCw size={15} />
          向右旋转
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setBox({ x: 0, y: 0, width: 1, height: 1 })}
        >
          选整张图
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          保留原图
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={confirm}>
          <Crop size={15} />
          {busy ? "处理图片中…" : "应用裁切"}
        </button>
      </div>
      {error && (
        <p className="math-error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
