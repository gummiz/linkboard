import { useState, type Dispatch, type DragEvent, type SubmitEvent } from "react";
import { CategoryCard } from "./CategoryCard";
import { categoryColor, type Board } from "./model";
import { CATEGORY_MIME, hasType, isLowerHalf } from "./dnd";
import type { Action } from "./store";

export function BoardView({ board, dispatch }: { board: Board; dispatch: Dispatch<Action> }) {
  const [newCategory, setNewCategory] = useState("");
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const linkCount = board.categories.reduce((total, category) => total + category.items.length, 0);

  const addCategory = (event: SubmitEvent) => {
    event.preventDefault();
    const name = newCategory.trim();
    if (name === "") return;
    const color = categoryColor(board.categories.length);
    dispatch({ type: "category/add", boardId: board.id, name, color });
    setNewCategory("");
  };

  const deleteBoard = () => {
    if (window.confirm(`Delete "${board.name}" and its ${linkCount} links?`)) {
      dispatch({ type: "board/delete", boardId: board.id });
    }
  };

  const categoryDragOver = (index: number) => (event: DragEvent<HTMLElement>) => {
    if (!hasType(event, CATEGORY_MIME)) return;
    event.preventDefault();
    setDropSlot(isLowerHalf(event) ? index + 1 : index);
  };

  const categoryDrop = (event: DragEvent<HTMLElement>) => {
    const categoryId = event.dataTransfer.getData(CATEGORY_MIME);
    if (categoryId === "" || dropSlot === null) return;
    event.preventDefault();
    dispatch({ type: "category/move", boardId: board.id, categoryId, toIndex: dropSlot });
    setDropSlot(null);
  };

  return (
    <section className="board" aria-label={board.name}>
      <div className="board-header">
        <input
          key={board.id}
          className="board-title"
          defaultValue={board.name}
          aria-label="Board name"
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name !== "" && name !== board.name) {
              dispatch({ type: "board/update", boardId: board.id, patch: { name } });
            } else event.target.value = board.name;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span className="board-meta">
          {board.categories.length} categories · {linkCount} links
        </span>
        <form className="add-category" onSubmit={addCategory}>
          <input
            value={newCategory}
            onChange={(event) => { setNewCategory(event.target.value); }}
            placeholder="New category"
            aria-label="New category name"
          />
          <button type="submit">Add</button>
        </form>
        <button type="button" className="danger subtle" onClick={deleteBoard}>
          Delete board
        </button>
      </div>

      {board.categories.length === 0 ? (
        <p className="empty-board">This board is empty. Add a category to start collecting links.</p>
      ) : (
        <div className="columns" onDragLeave={() => { setDropSlot(null); }}>
          {board.categories.map((category, index) => (
            <CategoryCard
              key={category.id}
              boardId={board.id}
              category={category}
              categories={board.categories}
              dispatch={dispatch}
              dropBefore={dropSlot === index}
              dropAfter={dropSlot === index + 1 && index === board.categories.length - 1}
              onCategoryDragOver={categoryDragOver(index)}
              onCategoryDrop={categoryDrop}
              onCategoryDragEnd={() => { setDropSlot(null); }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
