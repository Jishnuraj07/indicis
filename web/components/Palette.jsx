"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, typeVar } from "@/lib/api.js";
import { useVault } from "@/lib/vault.js";
import { Snippet } from "./Markdown.jsx";
import { noteHref, useOpen } from "@/lib/nav.js";

/** Search everything and run commands from one box (/ or Ctrl+K). */
export default function Palette() {
  const v = useVault();
  const router = useRouter();
  const { today } = useOpen();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  const [i, setI] = useState(0);
  const list = useRef(null);
  const close = () => v.setPalette(false);

  useEffect(() => {
    const query = q.trim();
    if (!query) { setHits(null); return; }
    const t = setTimeout(async () => { try { setHits(await api("/api/search?q=" + encodeURIComponent(query))); setI(0); } catch {} }, 120);
    return () => clearTimeout(t);
  }, [q]);

  const actions = useMemo(() => [
    { label: "Jot something down", key: "c", run: () => { close(); v.setCapturing(true); } },
    { label: "Open today's note", key: "t", run: () => { close(); today(); } },
    { label: "Open the map of all notes", key: "m", run: () => { close(); router.push("/map/"); } },
    { label: "Write a new note", run: () => { close(); router.push(q.trim() ? `/?new=${encodeURIComponent(q.trim())}` : "/?new=1"); } },
    { label: "Ask Claude to suggest links for every note", run: () => { close(); router.push("/?scan=1"); } },
    { label: v.calm ? "Let the graph move" : "Keep the graph still", run: () => { close(); v.setCalm(!v.calm); } },
    { label: "Switch light or dark", run: () => { close(); v.toggleTheme(); } },
  ], [q, v.calm]);

  const ql = q.trim().toLowerCase();
  const shownActions = ql ? actions.filter((a) => a.label.toLowerCase().includes(ql)) : actions;
  const recent = !ql ? v.recent.slice(0, 5) : [];
  const unwritten = ql ? v.unwritten.filter((n) => n.label.toLowerCase().includes(ql)).slice(0, 3) : [];
  const rows = [
    ...(hits || []).map((h) => ({ kind: "hit", h, run: () => { close(); router.push(noteHref(h.id)); } })),
    ...unwritten.map((n) => ({ kind: "ghost", n, run: () => { close(); router.push(noteHref(n.id)); } })),
    ...recent.map((n) => ({ kind: "recent", n, run: () => { close(); router.push(noteHref(n.id)); } })),
    ...shownActions.map((a) => ({ kind: "action", a, run: a.run })),
  ];
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [i]);

  let section = null;
  const heading = (kind) => {
    const name = { hit: "Notes", ghost: "Not written yet", recent: "Recently edited", action: "Actions" }[kind];
    if (section === name) return null;
    section = name;
    return <div className="pal-head" key={"h-" + name}>{name}</div>;
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Search or jump to">
        <div className="pal-input">
          <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m11 11 4 4" stroke="currentColor" strokeWidth="1.6" /></svg>
          <input autoFocus value={q} placeholder="Search everything you've written, or type a command" aria-label="Search"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((i + 1) % Math.max(rows.length, 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((i - 1 + rows.length) % Math.max(rows.length, 1)); }
              if (e.key === "Enter") { e.preventDefault(); rows[i]?.run(); }
              if (e.key === "Escape") close();
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" ref={list} role="listbox">
          {hits && !hits.length && !unwritten.length && (
            <div className="pal-empty">Nothing you've written matches "{q}". Pick an action below, or press <kbd>c</kbd> to jot it down.</div>
          )}
          {rows.map((r, k) => (
            <div key={k}>
              {heading(r.kind)}
              <button className="pal-row" role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={r.run}>
                {r.kind === "hit" && <>
                  <span className="pal-title"><span className="sw" style={{ "--c": `var(${typeVar(r.h.type)})` }} />{r.h.title}
                    {r.h.count > 0 && <span className="pal-meta">{r.h.count} {r.h.count === 1 ? "line" : "lines"}</span>}</span>
                  {r.h.lines.slice(0, 2).map((l, j) => <span key={j} className="pal-line"><Snippet text={l} ghosts={v.ghosts} onOpen={() => {}} mark={q.trim()} /></span>)}
                </>}
                {(r.kind === "recent" || r.kind === "ghost") && (
                  <span className="pal-title"><span className={`sw${r.n.ghost ? " ghost" : ""}`} style={{ "--c": `var(${typeVar(r.n.type)})` }} />{r.n.label}</span>
                )}
                {r.kind === "action" && <span className="pal-title action">{r.a.label}{r.a.key && <kbd>{r.a.key}</kbd>}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
