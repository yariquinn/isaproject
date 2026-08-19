import TodoWidget from "../TodoWidget";

export const metadata = { title: "To-Do · Portal" };

export default function TodoPage() {
  return (
    <div>
      <h1 className="page-title">To-Do</h1>
      <div className="panel" style={{ maxWidth: "42rem" }}>
        <TodoWidget />
      </div>
    </div>
  );
}
