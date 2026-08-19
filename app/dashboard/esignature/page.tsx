import Disclaimer from "../Disclaimer";

export const metadata = { title: "E-Signature · Portal" };

export default function ESignaturePage() {
  return (
    <div>
      <h1 className="page-title">E-Signature</h1>
      <Disclaimer>
        E-signature is a demo — sending and signing documents is not wired up
        yet.
      </Disclaimer>

      <div className="drive-panel" style={{ marginTop: "1.25rem" }}>
        <div className="drive-icon">✒︎</div>
        <h2>Send a document for signature</h2>
        <p>
          Upload an agreement, add signers, and collect legally-binding
          e-signatures. Integration coming later.
        </p>
        <button className="btn" type="button" disabled>
          New signature request
        </button>
        <p className="muted-line">Not connected yet.</p>
      </div>
    </div>
  );
}
