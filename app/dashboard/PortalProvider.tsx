"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Crumb = { label: string; href?: string };

type Ctx = {
  userName: string;
  crumbs: Crumb[];
  setCrumbs: (c: Crumb[]) => void;
  canManageBilling: boolean;
};

const PortalContext = createContext<Ctx>({
  userName: "Attorney",
  crumbs: [],
  setCrumbs: () => {},
  canManageBilling: true,
});

export function PortalProvider({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  // Billing/financial views (invoices, expenses) are gated on this permission.
  const [canManageBilling, setCanManageBilling] = useState(true);
  useEffect(() => {
    let active = true;
    supabase
      .from("user_settings")
      .select("can_manage_billing")
      .eq("name", userName)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data) setCanManageBilling(!!(data as { can_manage_billing: boolean }).can_manage_billing);
      });
    return () => { active = false; };
  }, [userName]);
  return (
    <PortalContext.Provider value={{ userName, crumbs, setCrumbs, canManageBilling }}>
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
