"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, noteUrl, typeVar } from "@/lib/api.js";
import { noteHref, useOpen } from "@/lib/nav.js";
import { useVault } from "@/lib/vault.js";
import Graph from "./Graph.jsx";
import Markdown from "./Markdown.jsx";
import { GhostView, NewNote, NoteView, ScanAll } from "./Panel.jsx";
import { CaptureBox } from "./Shell.jsx";

/** The main area: your desk, a note, a new note, or Claude's scan, chosen by the URL. */
export default function Workspace() {
  const params = useSearchParams();
  const router = useRouter();
  const v = useVault();
  const { open } = useOpen();
  const [createError, setCreateError] = useState(null);
  const n = params.get("n"), fresh = params.get("new"), scan = params.get("scan");

  const create = async (title, type) => {
    try {
      const r = await api("/api/notes", { method: "POST", body: JSON.stringify({ title, type }) });
      setCreateError(null);
      await v.reload();
      router.replace(noteHref(r.id));
    } catch (e) { setCreateError(e.message); }
  };

  if (fresh) return <div className="page narrow"><NewNote initial={fresh === "1" ? "" : fresh} onCreate={create} onCancel={() => router.back()} error={createError} /></div>;
  if (scan) return <div className="page narrow"><ScanAll nodes={v.graph.nodes} onOpen={open} reload={v.reload} onDone={() => {}} /></div>;
  if (n) {
    const node = v.byId.get(n);
    if (!v.loaded) return <div className="page"><div className="card skeleton" /></div>;
    if (!node) return <div className="page narrow"><div className="note err">There's no note called "{n}". It may have been renamed or deleted. <Link href="/">Back to your desk</Link></div></div>;
    if (node.ghost) {
      const from = [...(v.adj.get(n) || [])].map((id) => v.byId.get(id)).filter(Boolean);
      return <div className="page narrow"><GhostView node={node} linkedFrom={from} onCreate={create} onOpen={open} /></div>;
    }
    return (
      <NoteView key={n} id={n} ghosts={v.ghosts} titles={v.titles} byId={v.byId} version={v.version}
        onOpen={open} reload={v.reload} onTag={(t) => v.setPalette(true)}
        onRenamed={(id) => { router.replace(noteHref(id)); v.setToast({ text: "Renamed. Links in other notes were updated too." }); }}
        aside={<LocalGraph id={n} />} />
    );
  }
  return <Desk />;
}

/* ---------- the note's neighbourhood, following the open note ---------- */
function LocalGraph({ id }) {
  const v = useVault();
  const router = useRouter();
  const ref = useRef(null);
  const [hovered, setHovered] = useState(null);
  const near = new Set([id]);
  for (const a of v.adj.get(id) || []) { near.add(a); for (const b of v.adj.get(a) || []) near.add(b); }
  const key = [...near].sort().join("|");
  useEffect(() => { const t = setTimeout(() => ref.current?.fit(500), 700); return () => clearTimeout(t); }, [key]);
  return (
    <section className="local">
      <div className="local-head">
        <h3>Nearby notes</h3>
        <Link href="/map/" className="btn small">Open map</Link>
      </div>
      <div className="local-graph">
        <Graph ref={ref} nodes={v.graph.nodes} edges={v.graph.edges} visible={near} matches={null} calm={v.calm}
          selected={id} hovered={hovered} onHover={setHovered} onSelect={(x) => x !== id && router.push(noteHref(x))}
          onBackground={() => {}} />
      </div>
    </section>
  );
}

/* ---------- home: a desk with today's page and the cards you touched last ---------- */
function Desk() {
  const v = useVault();
  const router = useRouter();
  const { today } = useOpen();
  const [todayNote, setTodayNote] = useState(null);
  const date = new Date();
  const todayId = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const hasToday = v.byId.has(todayId);

  useEffect(() => {
    if (!hasToday) { setTodayNote(null); return; }
    api(noteUrl(todayId)).then(setTodayNote).catch(() => setTodayNote(null));
  }, [hasToday, todayId, v.version, v.graph]);

  const greeting = date.getHours() < 12 ? "Good morning" : date.getHours() < 18 ? "Good afternoon" : "Good evening";
  const day = date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page desk">
      <header className="desk-head">
        <p className="desk-date">{day}</p>
        <h1>{greeting}. What's on your mind?</h1>
      </header>

      <CaptureBox inline />

      {todayNote && todayNote.body.replace(/^\s*#.*\n?/, "").trim() && (
        <section className="desk-section">
          <div className="desk-section-head"><h2>Today so far</h2><button className="btn small" onClick={today}>Open today's note</button></div>
          <div className="card flat"><Markdown body={todayNote.body} title={todayNote.title} ghosts={v.ghosts} onOpen={(id) => router.push(noteHref(id))} /></div>
        </section>
      )}

      <section className="desk-section">
        <div className="desk-section-head"><h2>Pick up where you left off</h2></div>
        {v.loaded && !v.recent.length && <p className="nav-empty">Nothing here yet. Write a note, or jot something above.</p>}
        <div className="pile">
          {v.recent.slice(0, 8).map((n, i) => (
            <Link key={n.id} href={noteHref(n.id)} className="pile-card" style={{ "--c": `var(${typeVar(n.type)})`, "--r": `${((i * 37) % 7) - 3}deg` }}>
              <span className="pile-title">{n.label}</span>
              <span className="pile-meta">{n.degree ? `${n.degree} link${n.degree === 1 ? "" : "s"}` : "No links yet"}{n.tags.length ? `  #${n.tags.slice(0, 2).join(" #")}` : ""}</span>
            </Link>
          ))}
        </div>
      </section>

      {v.unwritten.length > 0 && (
        <section className="desk-section">
          <div className="desk-section-head"><h2>Waiting to be written</h2></div>
          <div className="chips">
            {v.unwritten.slice(0, 12).map((n) => <Link key={n.id} className="chip ghost-chip" href={noteHref(n.id)}>{n.label}</Link>)}
          </div>
        </section>
      )}
    </div>
  );
}
