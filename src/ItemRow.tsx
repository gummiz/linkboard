import { useState, type Dispatch, type DragEvent, type SubmitEvent } from "react";
import { ITEM_MIME, URI_MIME } from "./dnd";
import { Favicon } from "./Favicon";
import { normalizeUrl, type Category, type Item } from "./model";
import type { Action } from "./store";

interface Props {
  boardId: string;
  item: Item;
  hot: boolean;
  categoryId: string;
  categories: readonly Category[];
  dispatch: Dispatch<Action>;
  dropBefore: boolean;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
}

export function ItemRow({ boardId, item, hot, categoryId, categories, dispatch, dropBefore, onDragOver }: Props) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="item editing">
        <ItemEditor
          item={item}
          categoryId={categoryId}
          categories={categories}
          onCancel={() => { setEditing(false); }}
          onSave={(patch, toCategoryId) => {
            dispatch({ type: "item/update", boardId, itemId: item.id, patch });
            if (toCategoryId !== categoryId) {
              const target = categories.find((category) => category.id === toCategoryId);
              dispatch({
                type: "item/move",
                boardId,
                itemId: item.id,
                toCategoryId,
                toIndex: target?.items.length ?? 0,
              });
            }
            setEditing(false);
          }}
          onDelete={() => { dispatch({ type: "item/delete", boardId, itemId: item.id }); }}
        />
      </li>
    );
  }

  return (
    <li
      className={dropBefore ? "item drop-before" : "item"}
      draggable
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData(ITEM_MIME, item.id);
        event.dataTransfer.setData(URI_MIME, item.url);
        event.dataTransfer.setData("text/plain", item.url);
        event.dataTransfer.effectAllowed = "copyMove";
      }}
      onDragOver={onDragOver}
    >
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${item.name}\n${item.url}`}
        onClick={() => { dispatch({ type: "item/click", boardId, itemId: item.id }); }}
        onAuxClick={(event) => {
          if (event.button === 1) dispatch({ type: "item/click", boardId, itemId: item.id });
        }}
      >
        <Favicon url={item.url} name={item.name} />
        <span className="item-name">{item.name}</span>
        {hot && (
          <span className="hot" title={`Opened ${item.clicks} times`} aria-label="Frequently opened">
            ●
          </span>
        )}
      </a>
      <button type="button" className="icon-button edit" aria-label={`Edit ${item.name}`} onClick={() => { setEditing(true); }}>
        ✎
      </button>
      {item.note !== "" && <p className="item-note">{item.note}</p>}
    </li>
  );
}

interface EditorProps {
  item: Item;
  categoryId: string;
  categories: readonly Category[];
  onSave: (patch: Pick<Item, "name" | "url" | "note">, toCategoryId: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}

function ItemEditor({ item, categoryId, categories, onSave, onCancel, onDelete }: EditorProps) {
  const [name, setName] = useState(item.name);
  const [url, setUrl] = useState(item.url);
  const [note, setNote] = useState(item.note);
  const [target, setTarget] = useState(categoryId);
  const normalized = normalizeUrl(url);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (normalized === null) return;
    onSave({ name: name.trim() || item.name, url: normalized, note: note.trim() }, target);
  };

  return (
    <form className="item-editor" onSubmit={submit} onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}>
      <label>
        Name
        <input autoFocus value={name} onChange={(event) => { setName(event.target.value); }} />
      </label>
      <label>
        URL
        <input value={url} onChange={(event) => { setUrl(event.target.value); }} aria-invalid={normalized === null} />
      </label>
      <label>
        Note
        <textarea rows={2} value={note} onChange={(event) => { setNote(event.target.value); }} />
      </label>
      <label>
        Category
        <select value={target} onChange={(event) => { setTarget(event.target.value); }}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <div className="editor-actions">
        <button type="submit" className="primary" disabled={normalized === null}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="danger subtle" onClick={onDelete}>
          Delete
        </button>
      </div>
    </form>
  );
}
