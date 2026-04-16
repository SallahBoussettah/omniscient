import { useState, useEffect } from "react";
import { getActionItems, toggleActionItem } from "../lib/tauri";
import type { ActionItemData } from "../lib/tauri";

export function TasksPage() {
  const [tasks, setTasks] = useState<ActionItemData[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = (await getActionItems()) as unknown as ActionItemData[];
      setTasks(data);
    } catch {
      /* ignore */
    }
  }

  async function handleToggle(id: string, currentCompleted: boolean) {
    try {
      await toggleActionItem(id, !currentCompleted);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: !currentCompleted } : t))
      );
    } catch {
      /* ignore */
    }
  }

  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Tasks</h1>
        <p className="page-subtitle">
          Things you mentioned needing to do. Check them off as you go.
        </p>
      </header>

      {tasks.length === 0 ? (
        <div className="empty">
          <div className="empty-mark">
            <span className="material-symbols-outlined">task_alt</span>
          </div>
          <p className="empty-voice">No tasks waiting on you.</p>
          <p className="empty-hint">
            When you say something like "remind me to..." or "I need to..." in a
            conversation, I'll capture it here.
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="date-section">
              <div className="date-section-label">
                {pending.length} pending
              </div>
              {pending.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={handleToggle} />
              ))}
            </section>
          )}

          {done.length > 0 && (
            <section className="date-section">
              <div className="date-section-label">Completed</div>
              {done.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={handleToggle} />
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}

function TaskRow({
  task,
  onToggle,
}: {
  task: ActionItemData;
  onToggle: (id: string, completed: boolean) => void;
}) {
  return (
    <div
      className="conv-row"
      onClick={() => onToggle(task.id, task.completed)}
      style={{ alignItems: "center" }}
    >
      <div className="conv-icon" style={{
        background: task.completed ? "transparent" : "var(--accent-faint)",
        color: task.completed ? "var(--semantic-active)" : "var(--accent)",
      }}>
        <span className="material-symbols-outlined">
          {task.completed ? "check_circle" : "radio_button_unchecked"}
        </span>
      </div>
      <div className="conv-body">
        <div
          className="conv-title"
          style={{
            fontWeight: 400,
            color: task.completed ? "var(--text-3)" : "var(--text-1)",
            textDecoration: task.completed ? "line-through" : "none",
          }}
        >
          {task.description}
        </div>
      </div>
      <div className="conv-meta">
        <span className={`priority priority-${task.priority}`}>{task.priority}</span>
      </div>
    </div>
  );
}
