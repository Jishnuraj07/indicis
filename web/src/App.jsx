import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TYPES, api, cap, typeVar } from "./api.js";
import Graph from "./components/Graph.jsx";
import { Snippet } from "./components/Markdown.jsx";
import { GhostView, Home, NewNote, NoteView, ScanAll } from "./components/Panel.jsx";

function useStored(key, initial) {
  const [value, setValue] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}

function useTheme() {
  const [theme, setTheme] = useStored("kg-theme", null);
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
  }, [theme]);
  return () => {
    const dark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(dark ? "light" : "dark");
  };
}

const pad = (n) => String(n).padStart(2, "0");
const now = () => {
  const d = new Date();
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;

/* Quick capture: one box, Enter saves a line to today's journal note. */
function Capture({ onClose, onSaved }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    if (!text.trim()) return onClose();
    setBusy(true);
    try {
      const r = await api("/api/daily", { method: "POST", body: JSON.stringify({ ...now(), text }) });
      onSaved(r.id);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="capture" role="dialog" aria-label="Jot something down">
        <div className="tab" style={{ "--c": "var(--t-journal)" }}>Today, {now().date}</div>
        <textarea autoFocus value={text} placeholder="What's on your mind? Use [[links]] and #tags if you like."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === "Escape") onClose();
          }} />
        {error && <div className="note err">{error}</div>}
        <div className="capture-foot">
          <span className="kbd">Enter saves, Shift+Enter adds a line</span>
          <button className="btn quiet" onClick={onClose}>Cancel</button>
          <button className="btn ink" onClick={save} disabled={busy}>Save to today</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [view, setView] = useState("home"); // home | note | new | scan
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [nearby, setNearby] = useStored("kg-nearby", false);
  const [calm, setCalm] = useStored("kg-calm", false);
  const [scanning, setScanning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [toast, setToast] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [version, setVersion] = useState(null);
  const graphRef = useRef(null);
  const searchRef = useRef(null);
  const toggleTheme = useTheme();

  const reload = useCallback(async () => {
    const g = await api("/api/graph");
    setGraph({ nodes: g.nodes.map((n) => n.data), edges: g.edges.map((e) => e.data) });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // notice edits made here or in other apps (Obsidian, a text editor, git pull)
  useEffect(() => {
    let last = null;
    const check = async () => {
      if (document.hidden) return;
      try {
        const { version: v } = await api("/api/version");
        if (last && v !== last) { await reload(); setVersion(v); }
        last = v;
      } catch {}
    };
    check();
    const t = setInterval(check, 3000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);

  // search titles and everything written in the notes
  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits(null); return; }
    const t = setTimeout(async () => { try { setHits(await api("/api/search?q=" + encodeURIComponent(q))); } catch {} }, 140);
    return () => clearTimeout(t);
  }, [query, version]);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const adj = useMemo(() => {
    const m = new Map(graph.nodes.map((n) => [n.id, new Set()]));
    for (const e of graph.edges) { m.get(e.source)?.add(e.target); m.get(e.target)?.add(e.source); }
    return m;
  }, [graph]);
  const ghosts = useMemo(() => new Set(graph.nodes.filter((n) => n.ghost).map((n) => n.id)), [graph]);
  const titles = useMemo(() => graph.nodes.map((n) => n.label).sort((a, b) => a.localeCompare(b)), [graph]);
  const tags = useMemo(() => [...new Set(graph.nodes.flatMap((n) => n.tags))].sort(), [graph]);
  const types = useMemo(() => {
    const present = new Set(graph.nodes.map((n) => n.type));
    const known = [...TYPES, ...[...present].filter((t) => !TYPES.includes(t) && t !== "missing").sort()];
    return [...known.filter((t) => present.has(t)), ...(present.has("missing") ? ["missing"] : [])];
  }, [graph]);

  const visible = useMemo(() => {
    let ids = graph.nodes.filter((n) => (!typeFilter || n.type === typeFilter) && (!tag || n.tags.includes(tag))).map((n) => n.id);
    if (nearby && selected && adj.has(selected)) {
      const near = new Set([selected]);
      for (const a of adj.get(selected)) { near.add(a); for (const b of adj.get(a) || []) near.add(b); }
      ids = ids.filter((id) => near.has(id));
    }
    return new Set(ids);
  }, [graph, typeFilter, tag, nearby, selected, adj]);

  const matches = useMemo(() => (hits ? new Set(hits.map((h) => h.id)) : null), [hits]);

  // the graph follows whichever note you open
  const open = (id, { center = true } = {}) => {
    setSelected(id);
    setView("note");
    setSearchOpen(false);
    if (center) setTimeout(() => graphRef.current?.focus(id), 60);
  };
  const home = () => { setSelected(null); setView("home"); };

  const create = async (title, type) => {
    try {
      const r = await api("/api/notes", { method: "POST", body: JSON.stringify({ title, type }) });
      setCreateError(null);
      await reload();
      open(r.id);
    } catch (e) { setCreateError(e.message); }
  };
  const openToday = async () => {
    const r = await api("/api/daily", { method: "POST", body: JSON.stringify(now()) });
    await reload();
    open(r.id);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current.focus(); setSearchOpen(true); }
      if (e.key === "c") { e.preventDefault(); setCapturing(true); }
      if (e.key === "t") { e.preventDefault(); openToday(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const node = selected ? byId.get(selected) : null;
  const neighbours = node ? [...(adj.get(node.id) || [])].map((id) => byId.get(id)).filter(Boolean) : [];

  return (
    <div className="app">
      <header>
        <button className="brand" onClick={home} aria-label="Show overview">
          <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true">
            <rect x="5" y="1" width="20" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
            <rect x="1" y="6" width="20" height="14" rx="1.5" fill="var(--card)" stroke="currentColor" strokeWidth="1.5" />
            <path d="M1 10.5h20" stroke="var(--margin)" strokeWidth="1.5" />
          </svg>
          <b>Knowledge</b>
        </button>
        <div className="search-wrap">
          <label className="field search">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m11 11 4 4" stroke="currentColor" strokeWidth="1.6" /></svg>
            <input ref={searchRef} type="search" placeholder="Search everything" aria-label="Search notes" value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hits?.length) open(hits[0].id);
                if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); }
              }} />
          </label>
          {searchOpen && hits && (
            <div className="results" role="listbox">
              {!hits.length && <div className="res-empty">Nothing matches "{query}". Press <kbd>c</kbd> to jot it down instead.</div>}
              {hits.map((h) => (
                <button key={h.id} className="res" onMouseDown={(e) => e.preventDefault()} onClick={() => open(h.id)}>
                  <span className="res-title"><span className="sw" style={{ "--c": `var(${typeVar(h.type)})` }} />{h.title}
                    {h.count > 0 && <span className="res-count">{h.count} {h.count === 1 ? "line" : "lines"}</span>}</span>
                  {h.lines.slice(0, 2).map((l, i) => <span key={i} className="res-line"><Snippet text={l} ghosts={ghosts} onOpen={() => {}} mark={query.trim()} /></span>)}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="field tags">
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
            <option value="">Any tag</option>
            {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        </label>
        <label className="check hide-sm"><input type="checkbox" checked={nearby} onChange={(e) => setNearby(e.target.checked)} /> Only nearby notes</label>
        <div className="grow hide-sm" />
        <button className="btn" onClick={openToday} title="Open today's note (t)">Today</button>
        <button className="btn" onClick={() => setCapturing(true)} title="Jot something into today's note (c)">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12l-3 1 1-3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          <span className="hide-sm">Jot down</span>
        </button>
        <button className="btn" id="scanBtn" disabled={scanning} title="Ask Claude to suggest links for every note"
          onClick={() => { setSelected(null); setScanning(true); setView("scan"); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v4M8 11v4M1 8h4M11 8h4M3.5 3.5l2 2M10.5 10.5l2 2M12.5 3.5l-2 2M5.5 10.5l-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span>Ask Claude</span>
        </button>
        <button className="btn ink" onClick={() => { setSelected(null); setCreateError(null); setView("new"); }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          New note
        </button>
        <button className={`btn icon quiet${calm ? " on" : ""}`} onClick={() => setCalm(!calm)} aria-pressed={calm}
          aria-label={calm ? "Let the graph move" : "Keep the graph still"} title={calm ? "Let the graph move" : "Keep the graph still"}>
          {calm
            ? <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            : <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8c1.6-3 3.2-3 4.8 0s3.2 3 4.8 0 2.4-2 3.4-1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
        </button>
        <button className="btn icon quiet" onClick={toggleTheme} aria-label="Switch light or dark">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" /></svg>
        </button>
      </header>

      <main className="stage">
        <Graph ref={graphRef} nodes={graph.nodes} edges={graph.edges} visible={visible} matches={matches}
          selected={selected} hovered={hovered} onHover={setHovered} calm={calm}
          onSelect={(id) => open(id, { center: false })} onBackground={home} />
        <div className="legend" aria-label="Filter by note type">
          {types.map((t) => (
            <button key={t} className={t === "missing" ? "ghost" : ""} style={{ "--c": `var(${typeVar(t)})` }}
              aria-pressed={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? "" : t)}>
              {t === "missing" ? "Not written yet" : cap(t)}
            </button>
          ))}
        </div>
        <div className="zoom">
          <button className="btn" onClick={() => graphRef.current?.shake()} title="Give the cards a shake so they rearrange">Shake up</button>
          <button className="btn icon" onClick={() => graphRef.current?.fit()} aria-label="Fit all notes on screen" title="Fit all notes on screen">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        </div>
        {toast && <div className="toast" role="status">{toast.text}{toast.id && <button onClick={() => { open(toast.id); setToast(null); }}>Open</button>}</div>}
      </main>

      <aside aria-live="polite">
        {view === "home" && <Home nodes={graph.nodes} edges={graph.edges} onOpen={open} />}
        {view === "note" && node && !node.ghost && (
          <NoteView id={node.id} ghosts={ghosts} titles={titles} byId={byId} version={version}
            onOpen={open} reload={reload} onTag={(t) => setTag(t)}
            onRenamed={(id) => { open(id); setToast({ text: "Renamed. Links in other notes were updated too." }); }} />
        )}
        {view === "note" && node?.ghost && <GhostView node={node} linkedFrom={neighbours} onCreate={create} onOpen={open} />}
        {view === "new" && <NewNote onCreate={create} onCancel={home} error={createError} />}
        {view === "scan" && <ScanAll nodes={graph.nodes} onOpen={open} reload={reload} onDone={() => setScanning(false)} />}
      </aside>

      {capturing && (
        <Capture onClose={() => setCapturing(false)}
          onSaved={async (id) => { setCapturing(false); await reload(); setToast({ text: "Saved to today's note.", id }); }} />
      )}
    </div>
  );
}
