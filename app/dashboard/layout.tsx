import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/auth";
import Sidebar from "./Sidebar";
import TimeTracker from "./TimeTracker";

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
    <div className="dash">
      <Sidebar userName={userName} />
      <div className="dash-main">
        <TimeTracker />
        <div className="dash-content">{children}</div>
      </div>
    </div>
  );
}
