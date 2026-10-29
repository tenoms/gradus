import { createContext, useContext } from "react";
import { emptySession } from "../api/client";
import type { Session } from "../api/client";
export const SessionContext = createContext<{
  session: Session;
  refresh: () => Promise<void>;
  openLogin: () => void;
}>({ session: emptySession, refresh: async () => {}, openLogin: () => {} });
export const useSession = () => useContext(SessionContext);
