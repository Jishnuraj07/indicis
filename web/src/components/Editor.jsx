import { useLayoutEffect, useRef, useState } from "react";

// Where the caret sits inside a textarea, measured with an invisible mirror element.
function caretXY(ta) {
  const div = document.createElement("div");
  const cs = getComputedStyle(ta);
  for (const p of ["boxSizing", "width", "padding", "border", "font", "lineHeight", "letterSpacing", "whiteSpace", "wordWrap", "tabSize"])
    div.style[p] = cs[p];
  Object.assign(div.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word", top: 0, left: 0 });
  div.textContent = ta.value.slice(0, ta.selectionStart);
  const span = document.createElement("span");
  span.textContent = "​";
  div.appendChild(span);
  document.body.appendChild(div);
  const x = span.offsetLeft, y = span.offsetTop + span.offsetHeight;
  div.remove();
  return { x: x - ta.scrollLeft, y: y - ta.scrollTop };
}

/** A ruled textarea that suggests note titles after you type [[ */
export default function Editor({ value, onChange, titles, onSave, onCancel }) {
  const ta = useRef(null);
  const [pop, setPop] = useState(null); // { query, start, items, i, x, y }

  const update = () => {
    const el = ta.current;
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/\[\[([^\]\[\n|#]*)$/);
    if (!m) return setPop(null);
    const q = m[1].toLowerCase();
    const starts = titles.filter((t) => t.toLowerCase().startsWith(q));
    const has = titles.filter((t) => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
    const items = [...starts, ...has].slice(0, 7);
    const exact = titles.some((t) => t.toLowerCase() === q);
    if (q && !exact) items.push({ create: m[1] });
    if (!items.length) return setPop(null);
    setPop({ start: m.index + 2, items, i: 0, ...caretXY(el) });
  };

  const insert = (item) => {
    const el = ta.current;
    const title = typeof item === "string" ? item : item.create;
    const caret = el.selectionStart;
    const after = el.value.slice(caret);
    const close = after.startsWith("]]") ? "" : "]]";
    const next = el.value.slice(0, pop.start) + title + close + after;
    onChange(next);
    setPop(null);
    const pos = pop.start + title.length + 2;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  };

  useLayoutEffect(() => { ta.current.focus(); }, []);

  return (
    <div className="editor-wrap">
      <textarea ref={ta} className="ruled editor" spellCheck value={value} aria-label="Note text"
        onChange={(e) => { onChange(e.target.value); requestAnimationFrame(update); }}
        onClick={update}
        onBlur={() => setTimeout(() => setPop(null), 150)}
        onKeyDown={(e) => {
          if (pop) {
            if (e.key === "ArrowDown") { e.preventDefault(); return setPop({ ...pop, i: (pop.i + 1) % pop.items.length }); }
            if (e.key === "ArrowUp") { e.preventDefault(); return setPop({ ...pop, i: (pop.i - 1 + pop.items.length) % pop.items.length }); }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return insert(pop.items[pop.i]); }
            if (e.key === "Escape") { e.preventDefault(); return setPop(null); }
          }
          if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); onSave(); }
          else if (e.key === "Escape") onCancel();
        }} />
      {pop && (
        <ul className="ac" role="listbox" style={{ left: Math.min(pop.x + 18, 240), top: pop.y + 6 }}>
          {pop.items.map((it, i) => (
            <li key={typeof it === "string" ? it : "new"} role="option" aria-selected={i === pop.i}
              onMouseDown={(e) => { e.preventDefault(); insert(it); }}>
              {typeof it === "string" ? it : <>Link to new note <b>{it.create}</b></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
