"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type CursorMode = "browse" | "design";

type DesignModeContextValue = {
  mode: CursorMode;
  isDesignMode: boolean;
  setMode: (mode: CursorMode) => void;
  toggleDesignMode: () => void;
};

const DesignModeContext = createContext<DesignModeContextValue | null>(null);

export function DesignModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<CursorMode>("browse");

  const toggleDesignMode = useCallback(() => {
    setMode((current) => (current === "design" ? "browse" : "design"));
  }, []);

  return (
    <DesignModeContext.Provider
      value={{
        mode,
        isDesignMode: mode === "design",
        setMode,
        toggleDesignMode,
      }}
    >
      {children}
    </DesignModeContext.Provider>
  );
}

export function useDesignMode() {
  const context = useContext(DesignModeContext);
  if (!context) {
    throw new Error("useDesignMode must be used within DesignModeProvider");
  }
  return context;
}
