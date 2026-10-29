import { useEffect } from "react";
import type { RefObject } from "react";
export function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;
    const focusable = () => {
      const controls = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ).filter((el) => el.offsetParent !== null);
      return controls.filter((el) => {
        const radio = el as HTMLInputElement;
        if (radio.tagName !== "INPUT" || radio.type !== "radio" || !radio.name)
          return true;
        const group = controls.filter((candidate) => {
          const other = candidate as HTMLInputElement;
          return other.tagName === "INPUT" && other.type === "radio"
            && other.name === radio.name && other.form === radio.form;
        });
        return el === (group.find((item) => (item as HTMLInputElement).checked) || group[0]);
      });
    };
    focusable()[0]?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    root.addEventListener("keydown", trap);
    return () => {
      root.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [ref]);
}
