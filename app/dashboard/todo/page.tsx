import TodoWidget from "../TodoWidget";

export const metadata = { title: "Tasks · Portal" };

export default function TodoPage() {
  return (
    <div>
      <h1 className="page-title">Tasks</h1>
      <div className="panel" style={{ maxWidth: "42rem" }}>
        <TodoWidget />
      </div>
    </div>
  );
}
