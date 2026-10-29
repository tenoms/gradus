import { useEffect, useRef } from "react";
import { useSession } from "../../../shared/auth/session";
import { registerStudyTime } from "../state/store";
import type { StudyTimerDetails, StudyTimerHandle } from "./study-clock.mjs";

export function useStudyTimer({ key, enabled = true, ...details }: StudyTimerDetails & { key: string }) {
  const { session } = useSession();
  const timer = useRef<StudyTimerHandle | undefined>(undefined);
  const { platform, title, path, mode = "reading" } = details;
  useEffect(() => {
    const handle = registerStudyTime({ platform, title, path, mode, enabled });
    timer.current = handle;
    return () => { handle?.stop(); timer.current = undefined; };
  }, [session.user?.id, key, platform, title, path, mode]);
  useEffect(() => { timer.current?.setEnabled(enabled); }, [enabled]);
}
