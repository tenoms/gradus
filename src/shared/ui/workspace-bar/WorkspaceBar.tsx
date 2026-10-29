import type { ReactNode } from "react";
import "./workspace-bar.css";

type WorkspaceTab = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export function WorkspaceTabs({
  label,
  items,
  value,
  onChange,
  className = "",
}: {
  label: string;
  items: readonly WorkspaceTab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`tabs workspace-tabs ${className}`} role="group" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          key={item.value}
          className={value === item.value ? "active" : ""}
          aria-pressed={value === item.value}
          disabled={item.disabled}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function WorkspaceBar({
  label,
  navigation,
  children,
  className = "",
}: {
  label: string;
  navigation?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`workspace-bar ${className}`} role="group" aria-label={label}>
      {navigation && <div className="workspace-bar-navigation">{navigation}</div>}
      {children && <div className="workspace-bar-tools">{children}</div>}
    </div>
  );
}
