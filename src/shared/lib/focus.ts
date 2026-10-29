import { useEffect } from "react";
import type { RefObject } from "react";
export function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;
    const focusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ).filter((el) => el.offsetParent !== null);
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
