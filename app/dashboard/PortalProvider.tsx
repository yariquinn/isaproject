"use client";

import { createContext, useContext } from "react";

const PortalContext = createContext<{ userName: string }>({
  userName: "Attorney",
});

export function PortalProvider({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <PortalContext.Provider value={{ userName }}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  return useContext(PortalContext);
}
