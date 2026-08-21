import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/auth";
import Sidebar from "./Sidebar";
import AppHeader from "./AppHeader";
import Fab from "./Fab";
import { PortalProvider } from "./PortalProvider";
import { UndoProvider } from "./UndoProvider";
import { ConfirmProvider } from "./ConfirmProvider";

export const metadata = {
  title: "Portal · Isa Abdur-Rahman, PLLC",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const raw = cookies().get(AUTH_COOKIE)?.value;
  const userName = raw ? decodeURIComponent(raw) : "Attorney";

  return (
    <PortalProvider userName={userName}>
      <UndoProvider>
        <ConfirmProvider>
        <div className="dash">
          <Sidebar userName={userName} />
          <div className="dash-main">
            <AppHeader />
            <div className="dash-content">{children}</div>
          </div>
          <Fab />
        </div>
        </ConfirmProvider>
      </UndoProvider>
    </PortalProvider>
  );
}
