import { createContext, useContext, type ReactNode } from "react";

import type { WeKnoraKbDocEntry } from "@/core/streamdown";

const Ctx = createContext<Map<string, WeKnoraKbDocEntry> | null>(null);

export function WeKnoraKbCitationProvider(props: {
  value: Map<string, WeKnoraKbDocEntry>;
  children: ReactNode;
}) {
  return <Ctx.Provider value={props.value}>{props.children}</Ctx.Provider>;
}

export function useWeKnoraKbFileIndex(): Map<string, WeKnoraKbDocEntry> | null {
  return useContext(Ctx);
}
