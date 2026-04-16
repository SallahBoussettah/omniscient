import { useState, useEffect } from "react";
import { getActionItems, toggleActionItem } from "../lib/tauri";
import type { ActionItemData } from "../lib/tauri";

export function TasksPage() {
  const [tasks, setTasks] = useState<ActionItemData[]>([]);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      const data = (await getActionItems()) as unknown as ActionItemData[];
      setTasks(data);
    } catch {
      // ignore
    }
  }

  async function handleToggle(id: string, currentCompleted: boolean) {
    try {
      await toggleActionItem(id, !currentCompleted);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, completed: !currentCompleted } : t
        )
      );
    } catch {
      // ignore
    }
  }

  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Tasks</h1>
        <p className="page-subtitle">
          {pending.length} pending, {done.length} completed.
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">task_alt</span>
          <p className="primary-text">No tasks yet</p>
          <p className="secondary-text">
            Mention something to do in a conversation and it shows up here
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: "32px" }}>
              <div style={{ fontSize: "10px", fontWeight: 500, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                Pending
              </div>
              {pending.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={handleToggle} />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 500, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                Completed
              </div>
              {done.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={handleToggle} />
              ))}
            </div>
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
  const priorityColors: Record<string, string> = {
    high: "#ef4444",
    medium: "var(--amber)",
    low: "var(--text-4)",
  };

  return (
    <div
      className="conversation-row"
      style={{ alignItems: "center" }}
      onClick={() => onToggle(task.id, task.completed)}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: "20px",
          marginRight: "14px",
          color: task.completed ? "var(--green)" : "var(--text-4)",
          cursor: "pointer",
        }}
      >
        {task.completed ? "check_circle" : "radio_button_unchecked"}
      </span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "13px",
            color: task.completed ? "var(--text-3)" : "var(--text-1)",
            textDecoration: task.completed ? "line-through" : "none",
          }}
        >
          {task.description}
        </div>
      </div>
      <span
        style={{
          fontSize: "10px",
          padding: "2px 8px",
          borderRadius: "10px",
          background: "rgba(255,255,255,0.04)",
          color: priorityColors[task.priority] || "var(--text-4)",
        }}
      >
        {task.priority}
      </span>
    </div>
  );
}
