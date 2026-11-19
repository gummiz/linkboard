import { useState, type Dispatch, type DragEvent, type SubmitEvent } from "react";
import { CATEGORY_MIME, firstUri, hasType, isLowerHalf, ITEM_MIME, URI_MIME } from "./dnd";
import { ItemRow } from "./ItemRow";
import {
  CATEGORY_COLORS,
  VISIBLE_ITEM_LIMIT,
  hotItemIds,
  makeItem,
  nameFromUrl,
  normalizeUrl,
  type Category,
} from "./model";
import type { Action } from "./store";

interface Props {
  boardId: string;
  category: Category;
  categories: readonly Category[];
  dispatch: Dispatch<Action>;
  dropBefore: boolean;
  dropAfter: boolean;
  onCategoryDragOver: (event: DragEvent<HTMLElement>) => void;
  onCategoryDrop: (event: DragEvent<HTMLElement>) => void;
  onCategoryDragEnd: () => void;
}

export function CategoryCard(props: Props) {
  const { boardId, category, categories, dispatch } = props;
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [itemSlot, setItemSlot] = useState<number | null>(null);
  const hot = hotItemIds(category);
  const update = (patch: Extract<Action, { type: "category/update" }>["patch"]) => { dispatch({ type: "category/update", boardId, categoryId: category.id, patch }); };

  const hidden = category.showAll ? 0 : Math.max(0, category.items.length - VISIBLE_ITEM_LIMIT);
  const visible = category.collapsed ? [] : category.items.slice(0, category.items.length - hidden);

  const addLink = (event: SubmitEvent) => {
    event.preventDefault();
    const url = normalizeUrl(draft);
    if (url === null) {
      setInvalid(draft.trim() !== "");
      return;
    }
    dispatch({ type: "item/add", boardId, categoryId: category.id, item: makeItem(nameFromUrl(url), url) });
    setDraft("");
    setInvalid(false);
  };

  const remove = () => {
    const count = category.items.length;
    if (count === 0 || window.confirm(`Delete "${category.name}" and its ${count} links?`)) {
      dispatch({ type: "category/delete", boardId, categoryId: category.id });
    }
  };

  const acceptsItems = (event: DragEvent) => hasType(event, ITEM_MIME) || hasType(event, URI_MIME);

  const itemDragOver = (index: number) => (event: DragEvent<HTMLElement>) => {
    if (!acceptsItems(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setItemSlot(isLowerHalf(event) ? index + 1 : index);
  };

  const dropItem = (event: DragEvent<HTMLElement>) => {
    if (!acceptsItems(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const toIndex = itemSlot ?? visible.length;
    setItemSlot(null);
    const itemId = event.dataTransfer.getData(ITEM_MIME);
    if (itemId !== "") {
      dispatch({ type: "item/move", boardId, itemId, toCategoryId: category.id, toIndex });
      return;
    }
    const url = normalizeUrl(firstUri(event.dataTransfer.getData(URI_MIME)) ?? "");
    if (url === null) return;
    dispatch({ type: "item/add", boardId, categoryId: category.id, item: makeItem(nameFromUrl(url), url), toIndex });
  };

  const className = [
    "category",
    props.dropBefore ? "drop-before" : "",
    props.dropAfter ? "drop-after" : "",
  ].join(" ");

  return (
    <article
      className={className}
      style={{ borderLeftColor: category.color }}
      onDragOver={(event) => {
        props.onCategoryDragOver(event);
        if (acceptsItems(event)) {
          event.preventDefault();
          if (itemSlot === null) setItemSlot(visible.length);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setItemSlot(null);
      }}
      onDrop={(event) => {
        if (hasType(event, CATEGORY_MIME)) props.onCategoryDrop(event);
        else dropItem(event);
      }}
    >
      <header
        className="category-header"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(CATEGORY_MIME, category.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={props.onCategoryDragEnd}
      >
        <button
          type="button"
          className="collapse-toggle"
          aria-expanded={!category.collapsed}
          aria-label={category.collapsed ? `Expand ${category.name}` : `Collapse ${category.name}`}
          onClick={() => { update({ collapsed: !category.collapsed }); }}
        >
          {category.collapsed ? "▸" : "▾"}
        </button>
        <input
          key={category.name}
          className="category-title"
          defaultValue={category.name}
          aria-label="Category name"
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name !== "" && name !== category.name) update({ name });
            else event.target.value = category.name;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        {category.collapsed && <span className="category-count">{category.items.length}</span>}
        <button
          type="button"
          className="icon-button"
          aria-label={`${category.name} options`}
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen((open) => !open); }}
        >
          ⋯
        </button>
      </header>

      {menuOpen && (
        <div className="category-menu">
          <div className="swatches" role="radiogroup" aria-label="Category color">
            {CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={color === category.color}
                aria-label={`Color ${color}`}
                className="swatch"
                style={{ background: color }}
                onClick={() => { update({ color }); }}
              />
            ))}
          </div>
          <button type="button" className="danger subtle" onClick={remove}>
            Delete category
          </button>
        </div>
      )}

      {!category.collapsed && (
        <>
          <ul className="items">
            {visible.map((item, index) => (
              <ItemRow
                key={item.id}
                boardId={boardId}
                item={item}
                hot={hot.has(item.id)}
                categoryId={category.id}
                categories={categories}
                dispatch={dispatch}
                dropBefore={itemSlot === index}
                onDragOver={itemDragOver(index)}
              />
            ))}
            {itemSlot !== null && itemSlot >= visible.length && <li className="drop-marker" aria-hidden />}
          </ul>
          {category.items.length > VISIBLE_ITEM_LIMIT && (
            <button type="button" className="more" onClick={() => { update({ showAll: !category.showAll }); }}>
              {category.showAll ? "Show less" : `+ ${hidden} more`}
            </button>
          )}
          <form className="add-link" onSubmit={addLink}>
            <input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setInvalid(false);
              }}
              placeholder="Paste a link and press Enter"
              aria-label={`Add link to ${category.name}`}
              aria-invalid={invalid}
            />
            {invalid && <span className="field-error">Enter a web address, e.g. example.com</span>}
          </form>
        </>
      )}
    </article>
  );
}
