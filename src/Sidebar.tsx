import { useState, type Dispatch, type FormEvent } from "react";
import type { AppState } from "./model";
import type { Action } from "./store";

export function Sidebar({ state, dispatch }: { state: AppState; dispatch: Dispatch<Action> }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed !== "") dispatch({ type: "board/add", name: trimmed });
    setName("");
    setAdding(false);
  };

  return (
    <nav className="sidebar" aria-label="Boards">
      <h2>Boards</h2>
      <ul>
        {state.boards.map((board) => (
          <li key={board.id}>
            <button
              type="button"
              className={board.id === state.activeBoardId ? "board-link active" : "board-link"}
              aria-current={board.id === state.activeBoardId ? "page" : undefined}
              onClick={() => { dispatch({ type: "board/select", boardId: board.id }); }}
            >
              <span className="board-link-name">{board.name}</span>
              <span className="board-link-count">
                {board.categories.reduce((total, category) => total + category.items.length, 0)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form onSubmit={submit} className="inline-form">
          <input
            autoFocus
            value={name}
            onChange={(event) => { setName(event.target.value); }}
            onBlur={() => {
              if (name.trim() === "") setAdding(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setAdding(false);
            }}
            placeholder="Board name"
            aria-label="New board name"
          />
        </form>
      ) : (
        <button type="button" className="add-board" onClick={() => { setAdding(true); }}>
          + New board
        </button>
      )}
    </nav>
  );
}
