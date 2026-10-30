import { useEffect, useRef, useState } from "react";
import { TYPES, api, cap, noteUrl, plural, typeVar } from "../api.js";
import Markdown from "./Markdown.jsx";

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

/* ---------- home ---------- */
export function Home({ nodes, edges, onOpen }) {
  const notes = nodes.filter((n) => !n.ghost);
  const ghosts = nodes.filter((n) => n.ghost);
  const top = [...notes].sort((a, b) => b.degree - a.degree).slice(0, 6);
  return (
    <>
      <Card cardKey="home" tab="Overview" tone="--t-note" title="Your slip box"
        sub={`${plural(notes.length, "note")} and ${plural(edges.length, "link")}`}>
        <div className="ruled prose">
          <p>Each card is a note in your <code>vault</code> folder. Write <code>[[Note title]]</code> to link two notes, and they connect here.</p>
          <p>Drag a card to pull its neighbours along. Click one to read it. Dashed cards are notes you've linked to but not written yet.</p>
        </div>
      </Card>
      <LinkList title="Most connected" nodes={top} onOpen={onOpen} />
      <LinkList title="Not written yet" nodes={ghosts} onOpen={onOpen} />
    </>
  );
}

/* ---------- a note ---------- */
export function NoteView({ id, node, neighbours, ghosts, onOpen, onTag, reload }) {
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState(null);
  const [sugg, setSugg] = useState(null); // null | "loading" | {links,tags} | {error}

  const load = async () => {
    try { setNote(await api(noteUrl(id))); setError(null); } catch (e) { setError(e.message); }
  };
  useEffect(() => { setNote(null); setEditing(false); setSugg(null); setFlash(null); load(); }, [id]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(null), 3500); return () => clearTimeout(t); } }, [flash]);

  if (error) return <div className="note err">{error}</div>;
  if (!note) return <div className="card skeleton" aria-busy="true" />;

  const save = async () => {
    try {
      await api(noteUrl(id), { method: "PUT", body: JSON.stringify({ raw: draft }) });
      setEditing(false);
      await reload();
      await load();
      setFlash({ kind: "ok", text: "Saved." });
    } catch (e) { setFlash({ kind: "err", text: e.message }); }
  };
  const suggest = async () => {
    setSugg("loading");
    try { setSugg(await api(noteUrl(id) + "/suggest", { method: "POST" })); } catch (e) { setSugg({ error: e.message }); }
  };

  return (
    <>
      <Card cardKey={id} tab={cap(note.type)} tone={typeVar(note.type)} title={note.title}
        sub={<>
          {note.links.length ? `Links to ${note.links.length}` : "No links yet"}{neighbours.length ? `, connected to ${neighbours.length}` : ""}
          {note.tags.length > 0 && (
            <div className="chips">{note.tags.map((t) => <button key={t} className="chip" onClick={() => onTag(t)}>#{t}</button>)}</div>
          )}
        </>}
        foot={editing ? <>
          <button className="btn ink" onClick={save}>Save</button>
          <button className="btn quiet" onClick={() => setEditing(false)}>Cancel</button>
          <span className="kbd">Ctrl+S saves</span>
        </> : <>
          <button className="btn" onClick={() => { setDraft(note.raw); setEditing(true); }}>Edit</button>
          <button className="btn" onClick={suggest} disabled={sugg === "loading"}>Suggest links</button>
        </>}>
        {editing ? (
          <textarea className="ruled editor" autoFocus spellCheck value={draft} aria-label="Note text"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
              if (e.key === "Escape") setEditing(false);
            }} />
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
            onAdded={async (msg) => { setSugg(null); await reload(); await load(); setFlash({ kind: "ok", text: msg }); }} />
        )}
      </div>
      <LinkList title="Connected notes" nodes={neighbours} onOpen={onOpen} />
    </>
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

export function NewNote({ onCreate, onCancel, error }) {
  const [title, setTitle] = useState("");
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
