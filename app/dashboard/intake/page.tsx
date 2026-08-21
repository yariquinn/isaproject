import IntakeClient from "./IntakeClient";

export const metadata = { title: "Intake · Portal" };

export default function IntakePage() {
  return (
    <div>
      <h1 className="page-title">Client Intake</h1>
      <IntakeClient />
    </div>
  );
}
