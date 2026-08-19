import Disclaimer from "../Disclaimer";

export const metadata = { title: "Intake · Portal" };

export default function IntakePage() {
  return (
    <div>
      <h1 className="page-title">Client Intake</h1>
      <Disclaimer>
        This intake form is a demo — submissions are not saved or routed
        anywhere yet.
      </Disclaimer>

      <div className="panel" style={{ maxWidth: "40rem", marginTop: "1.25rem" }}>
        <h2 className="panel-title">New Intake</h2>
        <div className="intake-form">
          <label>
            Prospective client name
            <input placeholder="Full name or entity" disabled />
          </label>
          <label>
            Email
            <input placeholder="name@example.com" disabled />
          </label>
          <label>
            Phone
            <input placeholder="(000) 000-0000" disabled />
          </label>
          <label>
            Matter type
            <select disabled>
              <option>Real Estate</option>
              <option>Business Law</option>
              <option>Family Estates</option>
            </select>
          </label>
          <label>
            Describe the matter
            <textarea rows={4} disabled />
          </label>
          <button className="btn" type="button" disabled>
            Submit intake
          </button>
        </div>
      </div>
    </div>
  );
}
