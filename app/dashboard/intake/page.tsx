import Disclaimer from "../Disclaimer";
import IntakeClient from "./IntakeClient";

export const metadata = { title: "Intake · Portal" };

export default function IntakePage() {
  return (
    <div>
      <h1 className="page-title">Client Intake</h1>
      <Disclaimer>
        Leads captured here feed the pipeline. Converting a lead creates a client
        record automatically.
      </Disclaimer>

      <IntakeClient />
    </div>
  );
}
