import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, Info, PencilLine, X } from "lucide-react";
import { useDialogFocus } from "../../lib/focus";
import "./interaction-dialog.css";

export interface ConfirmationOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
export interface PromptOptions extends Omit<ConfirmationOptions, "danger"> {
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
}
type DialogKind = "confirm" | "message" | "prompt";
type DialogResult = boolean | string | null | undefined;
interface InteractionRequest {
  id: number;
  kind: DialogKind;
  options: ConfirmationOptions & PromptOptions;
  origin: HTMLElement | null;
  settle: (value: DialogResult) => void;
}
let present: ((request: InteractionRequest) => boolean) | undefined;
let nextId = 0;
const cancelled = (kind: DialogKind): DialogResult => kind === "confirm" ? false : kind === "prompt" ? null : undefined;
function requestInteraction(kind: DialogKind, options: InteractionRequest["options"]): Promise<DialogResult> {
  return new Promise(resolve => {
    const request: InteractionRequest = { id: ++nextId, kind, options, origin: typeof document === "undefined" ? null : document.activeElement as HTMLElement | null, settle: resolve };
    if (!present?.(request)) resolve(cancelled(kind));
  });
}
export async function confirmAction(options: ConfirmationOptions): Promise<boolean> { return await requestInteraction("confirm", options) === true; }
export async function promptAction(options: PromptOptions): Promise<string | null> {
  const value = await requestInteraction("prompt", options);
  return typeof value === "string" ? value : null;
}
export async function showMessage(options: Pick<ConfirmationOptions, "title" | "description">): Promise<void> { await requestInteraction("message", options); }

function InteractionDialog({ request, onFinish }: { request: InteractionRequest; onFinish: (value: DialogResult) => void }) {
  const ref = useRef<HTMLElement>(null), backdropRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(request.options.defaultValue || "");
  const { kind, options } = request;
  const dismiss = () => onFinish(cancelled(kind));
  useDialogFocus(ref);
  useEffect(() => {
    const backdrop = backdropRef.current;
    const background = Array.from(document.body.children).filter(element => element !== backdrop).map(element => ({ element: element as HTMLElement, inert: (element as HTMLElement).inert }));
    const previousOverflow = document.body.style.overflow;
    background.forEach(({ element }) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    if (kind === "prompt") { inputRef.current?.focus(); inputRef.current?.select(); }
    return () => {
      background.forEach(({ element, inert }) => { element.inert = inert; });
      document.body.style.overflow = previousOverflow;
      if (request.origin?.isConnected) request.origin.focus();
    };
  }, [request, kind]);
  const Icon = kind === "message" ? Info : kind === "prompt" ? PencilLine : options.danger ? CircleAlert : Check;
  return <div className="modal-backdrop interaction-backdrop" ref={backdropRef} onClick={dismiss}>
    <section className="modal interaction-dialog" role="dialog" aria-modal="true" aria-labelledby="interaction-title" aria-describedby={options.description ? "interaction-description" : undefined} ref={ref} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); } }}>
      <button type="button" className="icon-button modal-close" aria-label="关闭对话框" onClick={dismiss}><X size={20} /></button>
      <span className={`interaction-symbol ${options.danger ? "is-danger" : ""}`}><Icon size={24} /></span>
      <h2 id="interaction-title">{options.title}</h2>
      {options.description && <p id="interaction-description">{options.description}</p>}
      {kind === "prompt" ? <form onSubmit={event => { event.preventDefault(); onFinish(value); }}><label className="interaction-input-label">名称<input className="input" ref={inputRef} value={value} placeholder={options.placeholder} maxLength={options.maxLength} onChange={event => setValue(event.target.value)} /></label><div className="interaction-actions"><button type="button" className="btn btn-secondary" onClick={dismiss}>{options.cancelLabel || "取消"}</button><button type="submit" className="btn btn-primary">{options.confirmLabel || "保存"}</button></div></form> : <div className="interaction-actions">{kind === "confirm" && <button type="button" className="btn btn-secondary" onClick={dismiss}>{options.cancelLabel || "取消"}</button>}<button type="button" className={`btn ${options.danger ? "interaction-danger" : "btn-primary"}`} onClick={() => onFinish(kind === "confirm" ? true : undefined)}>{options.confirmLabel || (kind === "message" ? "知道了" : "确认")}</button></div>}
    </section>
  </div>;
}

export default function InteractionProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<InteractionRequest | null>(null);
  const active = useRef<InteractionRequest | null>(null);
  useEffect(() => {
    const open = (next: InteractionRequest) => {
      if (active.current) return false;
      active.current = next; setRequest(next); return true;
    };
    present = open;
    return () => {
      if (present === open) present = undefined;
      active.current?.settle(cancelled(active.current.kind)); active.current = null;
    };
  }, []);
  function finish(value: DialogResult) {
    const current = active.current;
    if (!current) return;
    active.current = null; setRequest(null); current.settle(value);
  }
  return <>{children}{request && createPortal(<InteractionDialog key={request.id} request={request} onFinish={finish} />, document.body)}</>;
}
