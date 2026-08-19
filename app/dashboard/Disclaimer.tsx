export default function Disclaimer({ children }: { children?: React.ReactNode }) {
  return (
    <div className="disclaimer">
      <span className="disclaimer-tag">Demo</span>
      <span>
        {children ??
          "This feature is a non-functional mock-up for demonstration only."}
      </span>
    </div>
  );
}
