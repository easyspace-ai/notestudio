import { createContext, useContext, type ReactNode } from "react";

export type WeKnoraChatSessionContextValue = {
  /** Current conversation id — used to linkify workspace paths and fetch workspace files */
  sessionId: string | null;
};

const WeKnoraChatSessionContext = createContext<WeKnoraChatSessionContextValue>({ sessionId: null });

export function WeKnoraChatSessionProvider(props: {
  sessionId: string | null;
  children: ReactNode;
}) {
  return (
    <WeKnoraChatSessionContext.Provider value={{ sessionId: props.sessionId }}>
      {props.children}
    </WeKnoraChatSessionContext.Provider>
  );
}

export function useWeKnoraChatSession(): WeKnoraChatSessionContextValue {
  return useContext(WeKnoraChatSessionContext);
}
