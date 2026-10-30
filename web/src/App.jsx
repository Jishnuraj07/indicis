import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TYPES, api, cap, typeVar } from "./api.js";
import Graph from "./components/Graph.jsx";
import { GhostView, Home, NewNote, NoteView, ScanAll } from "./components/Panel.jsx";

function useTheme() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("kg-theme"); } catch { return null; } });
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
    try { theme ? localStorage.setItem("kg-theme", theme) : localStorage.removeItem("kg-theme"); } catch {}
  }, [theme]);
  const toggle = () => {
    const dark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(dark ? "light" : "dark");
  };
  return toggle;
}

export default function App() {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [view, setView] = useState("home"); // home | note | new | scan
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [nearby, setNearby] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [createError, setCreateError] = useState(null);
  const graphRef = useRef(null);
  const searchRef = useRef(null);
  const toggleTheme = useTheme();

  const reload = useCallback(async () => {
    const g = await api("/api/graph");
    setGraph({ nodes: g.nodes.map((n) => n.data), edges: g.edges.map((e) => e.data) });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const adj = useMemo(() => {
    const m = new Map(graph.nodes.map((n) => [n.id, new Set()]));
    for (const e of graph.edges) { m.get(e.source)?.add(e.target); m.get(e.target)?.add(e.source); }
    return m;
  }, [graph]);
  const ghosts = useMemo(() => new Set(graph.nodes.filter((n) => n.ghost).map((n) => n.id)), [graph]);
  const tags = useMemo(() => [...new Set(graph.nodes.flatMap((n) => n.tags))].sort(), [graph]);
  const types = useMemo(() => {
    const present = new Set(graph.nodes.map((n) => n.type));
    return [...TYPES.filter((t) => present.has(t)), ...(present.has("missing") ? ["missing"] : [])];
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

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(graph.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
  }, [graph, query]);

  const open = (id, { center = true } = {}) => {
    if (!byId.has(id)) return;
    setSelected(id);
    setView("note");
    if (center) graphRef.current?.focus(id);
  };
  const home = () => { setSelected(null); setView("home"); };

  const create = async (title, type) => {
    try {
      const r = await api("/api/notes", { method: "POST", body: JSON.stringify({ title, type }) });
      setCreateError(null);
      await reload();
      setSelected(r.id); setView("note");
      setTimeout(() => graphRef.current?.focus(r.id), 350);
    } catch (e) { setCreateError(e.message); }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); searchRef.current.focus(); }
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
        <label className="field search">
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m11 11 4 4" stroke="currentColor" strokeWidth="1.6" /></svg>
          <input ref={searchRef} type="search" placeholder="Find a note" aria-label="Find a note" value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches?.size) open([...matches].find((id) => visible.has(id)) || [...matches][0]); }} />
        </label>
        <label className="field tags">
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
            <option value="">Any tag</option>
            {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        </label>
        <label className="check hide-sm"><input type="checkbox" checked={nearby} onChange={(e) => setNearby(e.target.checked)} /> Only nearby notes</label>
        <div className="grow hide-sm" />
        <button className="btn" id="scanBtn" disabled={scanning} title="Ask Claude to suggest links for every note"
          onClick={() => { setSelected(null); setScanning(true); setView("scan"); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v4M8 11v4M1 8h4M11 8h4M3.5 3.5l2 2M10.5 10.5l2 2M12.5 3.5l-2 2M5.5 10.5l-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span>Suggest links for all</span>
        </button>
        <button className="btn ink" onClick={() => { setSelected(null); setCreateError(null); setView("new"); }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          New note
        </button>
        <button className="btn icon quiet" onClick={toggleTheme} aria-label="Switch light or dark">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" /></svg>
        </button>
      </header>

      <main className="stage">
        <Graph ref={graphRef} nodes={graph.nodes} edges={graph.edges} visible={visible} matches={matches}
          selected={selected} hovered={hovered} onHover={setHovered}
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
      </main>

      <aside aria-live="polite">
        {view === "home" && <Home nodes={graph.nodes} edges={graph.edges} onOpen={open} />}
        {view === "note" && node && !node.ghost && (
          <NoteView id={node.id} node={node} neighbours={neighbours} ghosts={ghosts} onOpen={open} reload={reload}
            onTag={(t) => setTag(t)} />
        )}
        {view === "note" && node?.ghost && <GhostView node={node} linkedFrom={neighbours} onCreate={create} onOpen={open} />}
        {view === "new" && <NewNote onCreate={create} onCancel={home} error={createError} />}
        {view === "scan" && <ScanAll nodes={graph.nodes} onOpen={open} reload={reload} onDone={() => setScanning(false)} />}
      </aside>
    </div>
  );
}
