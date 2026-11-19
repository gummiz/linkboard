import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent } from "react";
import { Favicon } from "./Favicon";
import type { AppState } from "./model";
import { searchItems, type SearchHit } from "./search";
import type { Action } from "./store";

export function SearchBox({ state, dispatch }: { state: AppState; dispatch: Dispatch<Action> }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchItems(state, query), [state, query]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);

  const changeQuery = (next: string) => {
    setQuery(next);
    setSelected(0);
  };

  const open = (hit: SearchHit) => {
    dispatch({ type: "item/click", boardId: hit.board.id, itemId: hit.item.id });
    window.open(hit.item.url, "_blank", "noopener");
    changeQuery("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((index) => Math.min(index + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && hits[selected] !== undefined) {
      open(hits[selected]);
    } else if (event.key === "Escape") {
      changeQuery("");
      input.current?.blur();
    }
  };

  return (
    <div className="search">
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(event) => { changeQuery(event.target.value); }}
        onKeyDown={onKeyDown}
        placeholder="Search all boards  ( / )"
        aria-label="Search links"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls="search-results"
        aria-activedescendant={hits[selected] ? `hit-${hits[selected].item.id}` : undefined}
      />
      {query.trim() !== "" && (
        <ul id="search-results" className="search-results" role="listbox">
          {hits.length === 0 && <li className="search-empty">No links match “{query.trim()}”</li>}
          {hits.map((hit, index) => (
            <li
              key={hit.item.id}
              id={`hit-${hit.item.id}`}
              role="option"
              aria-selected={index === selected}
              className={index === selected ? "selected" : undefined}
              onMouseEnter={() => { setSelected(index); }}
              onMouseDown={(event) => {
                event.preventDefault();
                open(hit);
              }}
            >
              <Favicon url={hit.item.url} name={hit.item.name} />
              <span className="hit-name">{hit.item.name}</span>
              <span className="hit-path">
                {hit.board.name} › {hit.category.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
