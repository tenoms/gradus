import { useEffect } from "react";
import type { ReactNode } from "react";
import { MediaStudyContext } from "../../../shared/media/MediaStudyContext";
import type { MediaStudy } from "../../../shared/media/MediaStudyContext";
import { registerStudyTime, studyClock } from "../state/store";

const registerMedia = (details: MediaStudy) => registerStudyTime({ ...details, mode: "media", enabled: false });

/** Browser lifecycle and interaction signals are shared by every learning page. */
export default function StudyTimeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const foreground = () => studyClock.setForeground(!document.hidden && document.hasFocus());
    const interact = () => studyClock.interact();
    const hide = () => studyClock.setForeground(false);
    const events = ["pointerdown", "keydown", "scroll"] as const;
    for (const event of events) document.addEventListener(event, interact, { capture: true, passive: true });
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("focus", foreground);
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", foreground);
    foreground();
    const interval = window.setInterval(() => studyClock.tick(), 1000);
    return () => {
      window.clearInterval(interval);
      hide();
      for (const event of events) document.removeEventListener(event, interact, true);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", foreground);
    };
  }, []);
  return <MediaStudyContext.Provider value={registerMedia}>{children}</MediaStudyContext.Provider>;
}
