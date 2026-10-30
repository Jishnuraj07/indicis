"use client";
import { useEffect, useRef, useState } from "react";
import { TYPES, api, cap, noteUrl, plural, typeVar } from "@/lib/api.js";
import Editor from "./Editor.jsx";
import Markdown, { Snippet } from "./Markdown.jsx";

/* ---------- building blocks ---------- */
export function Card({ tab, tone, ghost, title, sub, children, foot, cardKey }) {
  return (
    <article className="card" key={cardKey}>
      <div className={`tab${ghost ? " ghost" : ""}`} style={{ "--c": `var(${tone})` }}>{tab}</div>
      <div className="card-head">
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {children}
      {foot && <div className="card-foot">{foot}</div>}
    </article>
  );
}

export function LinkList({ title, nodes, onOpen }) {
  if (!nodes.length) return null;
  return (
    <section className="section">
      <h3>{title}</h3>
      <ul className="links">
        {nodes.map((n) => (
          <li key={n.id}>
            <button onClick={() => onOpen(n.id)}>
              <span className={`sw${n.ghost ? " ghost" : ""}`} style={{ "--c": `var(${typeVar(n.type)})` }} />
              <span>{n.label}</span>
              <span className="n">{n.degree}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Flash({ msg }) {
  if (!msg) return null;
  return <div className={`note ${msg.kind}`} role="status">{msg.text}</div>;
}

/* ---------- a note ---------- */
export function NoteView({ id, ghosts, titles, byId, version, onOpen, onTag, reload, onRenamed, aside }) {
  const [note, setNote] = useState(null);
  const [ctx, setCtx] = useState(null); // backlinks, mentions, related
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(null); // null | draft title
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState(null);
  const [sugg, setSugg] = useState(null); // null | "loading" | {links,tags} | {error}

  const load = async () => {
    try {
      const [n, c] = await Promise.all([api(noteUrl(id)), api(noteUrl(id) + "/context")]);
      setNote(n); setCtx(c); setError(null);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { setNote(null); setCtx(null); setEditing(false); setRenaming(null); setSugg(null); setFlash(null); load(); }, [id]);
  // files changed on disk (here or in another app): refresh unless mid-edit
  useEffect(() => { if (note && !editing) load(); }, [version]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(null), 3500); return () => clearTimeout(t); } }, [flash]);

  if (error) return <div className="page narrow"><div className="note err">{error}</div></div>;
  if (!note) return <div className="page"><div className="card skeleton" aria-busy="true" /></div>;

  const after = async (msg) => { await reload(); await load(); if (msg) setFlash({ kind: "ok", text: msg }); };
  const save = async () => {
    try {
      await api(noteUrl(id), { method: "PUT", body: JSON.stringify({ raw: draft }) });
      setEditing(false);
      await after("Saved.");
    } catch (e) { setFlash({ kind: "err", text: e.message }); }
  };
  const rename = async () => {
    const title = renaming.trim();
    if (!title || title === note.title) return setRenaming(null);
    try {
      const r = await api(noteUrl(id) + "/rename", { method: "POST", body: JSON.stringify({ title }) });
      await reload();
      onRenamed(r.id);
    } catch (e) { setFlash({ kind: "err", text: e.message }); }
  };
  const suggest = async () => {
    setSugg("loading");
    try { setSugg(await api(noteUrl(id) + "/suggest", { method: "POST" })); } catch (e) { setSugg({ error: e.message }); }
  };
  const linkMention = async (m) => {
    try {
      await api(noteUrl(id) + "/link-mention", { method: "POST", body: JSON.stringify({ source: m.id }) });
      await after(`Linked from ${m.title}.`);
    } catch (e) { setFlash({ kind: "err", text: e.message }); }
  };
  const linkRelated = async (r) => {
    try {
      await api(noteUrl(id) + "/accept", { method: "POST", body: JSON.stringify({ links: [r.title], tags: [] }) });
      await after(`Linked to ${r.title}.`);
    } catch (e) { setFlash({ kind: "err", text: e.message }); }
  };

  const outgoing = note.links.map((l) => byId.get(l.toLowerCase())).filter(Boolean);
  const titleEl = renaming !== null ? (
    <input className="rename" autoFocus value={renaming} aria-label="New title"
      onChange={(e) => setRenaming(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(null); }} />
  ) : note.title;

  return (
    <div className="page note-page">
     <div className="note-col">
      <Card cardKey={id} tab={cap(note.type)} tone={typeVar(note.type)} title={titleEl}
        sub={<>
          {note.links.length ? `Links to ${note.links.length}` : "No links yet"}
          {ctx?.backlinks.length ? `, linked from ${ctx.backlinks.length}` : ""}
          {note.tags.length > 0 && (
            <div className="chips">{note.tags.map((t) => <button key={t} className="chip" onClick={() => onTag(t)}>#{t}</button>)}</div>
          )}
        </>}
        foot={editing ? <>
          <button className="btn ink" onClick={save}>Save</button>
          <button className="btn quiet" onClick={() => setEditing(false)}>Cancel</button>
          <span className="kbd">Type [[ to link. Ctrl+S saves</span>
        </> : renaming !== null ? <>
          <button className="btn ink" onClick={rename}>Rename</button>
          <button className="btn quiet" onClick={() => setRenaming(null)}>Cancel</button>
          <span className="kbd">Links to it are updated too</span>
        </> : <>
          <button className="btn" onClick={() => { setDraft(note.raw); setEditing(true); }}>Edit</button>
          <button className="btn" onClick={() => setRenaming(note.title)}>Rename</button>
          <button className="btn" onClick={suggest} disabled={sugg === "loading"}>Ask Claude for links</button>
        </>}>
        {editing ? (
          <Editor value={draft} onChange={setDraft} titles={titles} onSave={save} onCancel={() => setEditing(false)} />
        ) : (
          <Markdown body={note.body} title={note.title} ghosts={ghosts} onOpen={onOpen} />
        )}
      </Card>
      <div className="suggest">
        <Flash msg={flash} />
        {sugg === "loading" && <div className="slip"><div className="thinking"><span className="pen" />Claude is reading this note and looking for connections</div></div>}
        {sugg?.error && <div className="note err">{sugg.error}</div>}
        {sugg?.links && (
          <Suggestions id={id} title="Suggested by Claude" s={sugg}
            onAdded={async (msg) => { setSugg(null); await after(msg); }} />
        )}
      </div>
     </div>

     <aside className="ctx-col" aria-label="Context">
      {aside}
      {ctx && !ctx.backlinks.length && !ctx.mentions.length && !ctx.related.length && !note.links.length && (
        <p className="nav-empty">Nothing links here yet. Link this note from another one with [[{note.title}]], or use Edit to link out.</p>
      )}

      {ctx?.backlinks.length > 0 && (
        <section className="section">
          <h3>Linked from</h3>
          <ul className="context">
            {ctx.backlinks.map((b) => (
              <li key={b.id}>
                <button className="ctx-title" onClick={() => onOpen(b.id)}>
                  <span className="sw" style={{ "--c": `var(${typeVar(b.type)})` }} />{b.title}
                </button>
                {b.snippets.map((s, i) => <p key={i}><Snippet text={s} ghosts={ghosts} onOpen={onOpen} /></p>)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ctx?.mentions.length > 0 && (
        <section className="section">
          <h3>Mentioned without a link</h3>
          <ul className="context">
            {ctx.mentions.map((m) => (
              <li key={m.id}>
                <div className="ctx-row">
                  <button className="ctx-title" onClick={() => onOpen(m.id)}>
                    <span className="sw" style={{ "--c": `var(${typeVar(m.type)})` }} />{m.title}
                  </button>
                  <button className="btn small" onClick={() => linkMention(m)}>Link it</button>
                </div>
                <p><Snippet text={m.snippet} ghosts={ghosts} onOpen={onOpen} mark={m.match} /></p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ctx?.related.length > 0 && (
        <section className="section">
          <h3>Similar notes <span className="hint">found on this computer</span></h3>
          <ul className="context">
            {ctx.related.map((r) => (
              <li key={r.id}>
                <div className="ctx-row">
                  <button className="ctx-title" onClick={() => onOpen(r.id)}>
                    <span className="sw" style={{ "--c": `var(${typeVar(r.type)})` }} />{r.title}
                  </button>
                  <button className="btn small" onClick={() => linkRelated(r)}>Link</button>
                </div>
                <p className="shared">Both mention {r.shared.join(", ")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LinkList title="Links to" nodes={outgoing} onOpen={onOpen} />
     </aside>
    </div>
  );
}

/* ---------- Claude's suggestions ---------- */
export function Suggestions({ id, title, s, onAdded, onOpenTitle }) {
  const [links, setLinks] = useState(() => s.links.map(() => true));
  const [tags, setTags] = useState(() => s.tags.map(() => true));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!s.links.length && !s.tags.length) return <div className="note">Claude found nothing new to link for {title === "Suggested by Claude" ? "this note" : title}.</div>;
  const n = links.filter(Boolean).length + tags.filter(Boolean).length;

  const add = async () => {
    setBusy(true);
    try {
      const r = await api(noteUrl(id) + "/accept", { method: "POST", body: JSON.stringify({
        links: s.links.filter((_, i) => links[i]).map((l) => l.target),
        tags: s.tags.filter((_, i) => tags[i]),
      }) });
      await onAdded(`Added ${plural(r.added_links.length, "link")} and ${plural(r.added_tags.length, "tag")}.`);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div className="slip">
      <div className="slip-head">
        {onOpenTitle ? <button onClick={onOpenTitle}>{title}</button> : <b>{title}</b>}
        <span>Tick what to add</span>
      </div>
      {error && <div className="note err" style={{ margin: "0 16px" }}>{error}</div>}
      {s.links.map((l, i) => (
        <label className="opt" key={l.target}>
          <input type="checkbox" checked={links[i]} onChange={() => setLinks(links.map((v, j) => (j === i ? !v : v)))} />
          <span><span className="t">{l.target}</span>{!l.existing && <span className="pill">new note</span>}<small>{l.reason}</small></span>
        </label>
      ))}
      {s.tags.length > 0 && (
        <div className="opt tags-row"><span />
          <span className="chips">
            {s.tags.map((t, i) => (
              <label className="chip tick" key={t}>
                <input type="checkbox" checked={tags[i]} onChange={() => setTags(tags.map((v, j) => (j === i ? !v : v)))} />#{t}
              </label>
            ))}
          </span>
        </div>
      )}
      <div className="card-foot">
        <button className="btn ink" disabled={!n || busy} onClick={add}>{n ? `Add ${n} to note` : "Nothing selected"}</button>
      </div>
    </div>
  );
}

/* ---------- a note that isn't written yet ---------- */
export function GhostView({ node, linkedFrom, onCreate, onOpen }) {
  const [type, setType] = useState("concept");
  return (
    <>
      <Card cardKey={node.id} tab="Not written yet" ghost tone="--t-missing" title={node.label}
        sub={`Linked from ${plural(linkedFrom.length, "note")}`}
        foot={<button className="btn ink" onClick={() => onCreate(node.label, type)}>Create note</button>}>
        <div className="form">
          <label>What kind of note is it?
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
          </label>
        </div>
      </Card>
      <LinkList title="Linked from" nodes={linkedFrom} onOpen={onOpen} />
    </>
  );
}

export function NewNote({ initial = "", onCreate, onCancel, error }) {
  const [title, setTitle] = useState(initial);
  const [type, setType] = useState("concept");
  const go = () => title.trim() && onCreate(title.trim(), type);
  return (
    <Card cardKey="new" tab="New" tone="--accent" title="New note"
      foot={<>
        <button className="btn ink" onClick={go} disabled={!title.trim()}>Create note</button>
        <button className="btn quiet" onClick={onCancel}>Cancel</button>
      </>}>
      <div className="form">
        <label>Title<input autoFocus value={title} placeholder="For example: Second brain"
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} /></label>
        <label>Kind
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
          </select>
        </label>
        {error && <div className="note err">{error}</div>}
      </div>
    </Card>
  );
}

/* ---------- suggest links for every note ---------- */
export function ScanAll({ nodes, onOpen, reload, onDone }) {
  const [state, setState] = useState({ i: 0, label: "", results: [], error: null, done: false });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const notes = nodes.filter((n) => !n.ghost);
    (async () => {
      const results = [];
      for (let i = 0; i < notes.length; i++) {
        setState((s) => ({ ...s, i, label: notes[i].label }));
        try {
          const s = await api(noteUrl(notes[i].id) + "/suggest", { method: "POST" });
          if (s.links.length || s.tags.length) { results.push({ node: notes[i], s }); setState((st) => ({ ...st, results: [...results] })); }
        } catch (e) { setState((st) => ({ ...st, error: e.message })); break; }
      }
      setState((st) => ({ ...st, i: notes.length, done: true }));
      onDone();
    })();
  }, []);
  const total = nodes.filter((n) => !n.ghost).length;
  const [added, setAdded] = useState({});
  return (
    <>
      <Card cardKey="scan" tab="Claude" tone="--accent" title="Suggesting links for all notes"
        sub={<>
          {state.done
            ? state.results.length ? `${state.results.length} of ${total} notes have suggestions. Review them below.` : `Checked ${total} notes. Nothing new to link.`
            : `Reading ${state.label} (${state.i + 1} of ${total})`}
          <div className="progress"><i style={{ width: `${(state.i / Math.max(total, 1)) * 100}%` }} /></div>
        </>} />
      {state.error && <div className="note err">{state.error}</div>}
      <div className="scan-list">
        {state.results.map(({ node, s }) => added[node.id]
          ? <div className="note ok" key={node.id}>{node.label}: {added[node.id]}</div>
          : <Suggestions key={node.id} id={node.id} title={node.label} s={s} onOpenTitle={() => onOpen(node.id)}
              onAdded={async (msg) => { await reload(); setAdded((a) => ({ ...a, [node.id]: msg })); }} />)}
      </div>
    </>
  );
}
