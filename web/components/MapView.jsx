"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, cap, noteUrl, typeVar } from "@/lib/api.js";
import { noteHref } from "@/lib/nav.js";
import { useVault } from "@/lib/vault.js";
import Graph from "./Graph.jsx";
import Markdown from "./Markdown.jsx";

/** Every note at once, as a live physics graph. Click a card to peek at it. */
export default function MapView() {
  const v = useVault();
  const ref = useRef(null);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [tag, setTag] = useState("");
  const [find, setFind] = useState("");
  const [peek, setPeek] = useState(null);

  const visible = useMemo(() => new Set(v.graph.nodes
    .filter((n) => (!typeFilter || n.type === typeFilter) && (!tag || n.tags.includes(tag)))
    .map((n) => n.id)), [v.graph, typeFilter, tag]);
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? new Set(v.graph.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)) : null;
  }, [v.graph, find]);

  useEffect(() => {
    if (!selected || v.byId.get(selected)?.ghost) { setPeek(null); return; }
    let live = true;
    api(noteUrl(selected)).then((n) => live && setPeek(n)).catch(() => live && setPeek(null));
    return () => { live = false; };
  }, [selected, v.version]);

  const node = selected && v.byId.get(selected);
  return (
    <div className="map">
      <div className="map-bar">
        <h1>Map of everything</h1>
        <label className="field">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m11 11 4 4" stroke="currentColor" strokeWidth="1.6" /></svg>
          <input type="search" placeholder="Highlight cards" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Highlight cards by title" />
        </label>
        <label className="field">
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
            <option value="">Any tag</option>
            {v.tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        </label>
        <div className="grow" />
        <button className="btn" onClick={() => ref.current?.shake()} title="Give the cards a shake so they rearrange">Shake up</button>
        <button className="btn icon" onClick={() => ref.current?.fit()} aria-label="Fit all notes on screen" title="Fit all notes on screen">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
      </div>
      <div className="map-stage">
        <Graph ref={ref} nodes={v.graph.nodes} edges={v.graph.edges} visible={visible} matches={matches} calm={v.calm}
          selected={selected} hovered={hovered} onHover={setHovered}
          onSelect={(id) => setSelected(id === selected ? null : id)} onBackground={() => setSelected(null)} />
        <div className="legend" aria-label="Filter by note type">
          {v.types.map((t) => (
            <button key={t} className={t === "missing" ? "ghost" : ""} style={{ "--c": `var(${typeVar(t)})` }}
              aria-pressed={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? "" : t)}>
              {t === "missing" ? "Not written yet" : cap(t)}
            </button>
          ))}
        </div>
        {node && (
          <article className="peek" key={node.id}>
            <div className="tab" style={{ "--c": `var(${typeVar(node.type)})` }}>{node.ghost ? "Not written yet" : cap(node.type)}</div>
            <h2>{node.label}</h2>
            <p className="sub">{node.degree ? `Connected to ${node.degree}` : "Not linked to anything yet"}</p>
            {peek && <div className="peek-body"><Markdown body={peek.body} title={peek.title} ghosts={v.ghosts} onOpen={setSelected} /></div>}
            <div className="peek-foot">
              <Link className="btn ink" href={noteHref(node.id)}>{node.ghost ? "Write this note" : "Open note"}</Link>
              <button className="btn quiet" onClick={() => setSelected(null)}>Close</button>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
