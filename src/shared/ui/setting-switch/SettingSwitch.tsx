import { useId } from "react";
import { LoaderCircle } from "lucide-react";
import "./setting-switch.css";

interface SettingSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  pending?: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
  id?: string;
}

export default function SettingSwitch({ label, description, checked, pending = false, disabled = false, onChange, id }: SettingSwitchProps) {
  const descriptionId = useId();
  return <div className="setting-switch-row">
    <div className="setting-switch-copy">
      <strong>{label}</strong>
      {description && <p id={descriptionId}>{description}</p>}
    </div>
    <div className="setting-switch-control">
      <span className={`setting-switch-status ${checked ? "is-on" : ""}`} role="status" aria-live="polite">{pending ? "保存中…" : checked ? "已开启" : "已关闭"}</span>
      <button
        id={id}
        type="button"
        className={`setting-switch-button ${pending ? "is-pending" : ""}`}
        role="switch"
        aria-label={label}
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={pending || undefined}
        disabled={disabled || pending}
        onClick={() => onChange(!checked)}
      >
        <span className="setting-switch-track" aria-hidden="true"><span className="setting-switch-thumb">{pending && <LoaderCircle size={13} className="spin" />}</span></span>
      </button>
    </div>
  </div>;
}
