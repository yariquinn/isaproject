"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Crumb = { label: string; href?: string };

type Ctx = {
  userName: string;
  crumbs: Crumb[];
  setCrumbs: (c: Crumb[]) => void;
};

const PortalContext = createContext<Ctx>({
  userName: "Attorney",
  crumbs: [],
  setCrumbs: () => {},
});

export function PortalProvider({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  return (
    <PortalContext.Provider value={{ userName, crumbs, setCrumbs }}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  return useContext(PortalContext);
}

// Pages call this to drive the universal header breadcrumb. Clears on unmount.
export function useCrumbs(crumbs: Crumb[]) {
  const { setCrumbs } = usePortal();
  const key = crumbs.map((c) => `${c.label}|${c.href ?? ""}`).join(">");
  useEffect(() => {
    setCrumbs(crumbs);
    return () => setCrumbs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
