"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, typeVar } from "@/lib/api.js";
import { noteHref, useOpen } from "@/lib/nav.js";
import { VaultProvider, now, useVault } from "@/lib/vault.js";
import Palette from "./Palette.jsx";

const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;

export default function Shell({ children }) {
  return (
    <VaultProvider>
      <Suspense>
        <Frame>{children}</Frame>
      </Suspense>
    </VaultProvider>
  );
}

function Frame({ children }) {
  const v = useVault();
  const { open, today } = useOpen();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => setMenu(false), [pathname, params]);

  // drop documents anywhere to import them
  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
    const enter = (e) => { if (hasFiles(e)) { depth++; setDropping(true); } };
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDropping(false); } };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; setDropping(false);
      v.importFiles([...e.dataTransfer.files]);
    };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop);
    };
  }, [v.importFiles]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); v.setPalette(true); return; }
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); v.setPalette(true); }
      if (e.key === "c") { e.preventDefault(); v.setCapturing(true); }
      if (e.key === "t") { e.preventDefault(); today(); }
      if (e.key === "m") { e.preventDefault(); router.push(window.location.pathname.startsWith("/map") ? "/" : "/map/"); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`frame${menu ? " menu-open" : ""}`}>
      <Rail onToday={today} onMenu={() => setMenu(!menu)} />
      <div className="main">{children}</div>
      {v.capturing && <Capture />}
      {dropping && (
        <div className="drop-zone" aria-hidden="true">
          <div className="drop-card"><h2>Drop to import</h2><p>PDFs, Word, slides, web pages and scans become notes. They're converted on this computer.</p></div>
        </div>
      )}
      <ImportTray />
      {v.installHelp && <InstallHelp />}
      {v.palette && <Palette />}
      {v.toast && (
        <div className="toast" role="status">{v.toast.text}
          {v.toast.id && <button onClick={() => { open(v.toast.id); v.setToast(null); }}>Open</button>}
        </div>
      )}
    </div>
  );
}

function NavList({ title, items, current, empty, limit = 8 }) {
  const [all, setAll] = useState(false);
  if (!items.length && !empty) return null;
  const shown = all ? items : items.slice(0, limit);
  return (
    <section className="nav-group">
      <h2>{title}{items.length > 0 && <span className="count">{items.length}</span>}</h2>
      {!items.length && <p className="nav-empty">{empty}</p>}
      <ul>
        {shown.map((n) => (
          <li key={n.id}>
            <Link href={noteHref(n.id)} className={`nav-item${current === n.id ? " current" : ""}${n.ghost ? " ghost" : ""}`}
              aria-current={current === n.id ? "page" : undefined}>
              <span className="sw" style={{ "--c": `var(${typeVar(n.type)})` }} />
              <span className="nav-label">{n.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > limit && (
        <button className="nav-more" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${items.length}`}</button>
      )}
    </section>
  );
}

function Rail({ onToday, onMenu }) {
  const v = useVault();
  const pathname = usePathname();
  const current = useSearchParams().get("n");
  const onMap = pathname.startsWith("/map");
  return (
    <nav className="rail" aria-label="Notes">
      <div className="rail-top">
        <Link href="/" className="brand" aria-label="Indicis: your desk">
          <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true">
            <rect x="5" y="1" width="20" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
            <rect x="1" y="6" width="20" height="14" rx="1.5" fill="var(--card)" stroke="currentColor" strokeWidth="1.5" />
            <path d="M1 10.5h20" stroke="var(--margin)" strokeWidth="1.5" />
          </svg>
          <b>Indicis</b>
        </Link>
        <button className="btn icon quiet menu-btn" onClick={onMenu} aria-label="Show notes">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>

      <button className="search-btn" onClick={() => v.setPalette(true)}>
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m11 11 4 4" stroke="currentColor" strokeWidth="1.6" /></svg>
        <span>Search or jump to</span><kbd>/</kbd>
      </button>

      <div className="rail-body">
        <div className="rail-actions">
          <button className="btn ink" onClick={() => v.setCapturing(true)}>
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12l-3 1 1-3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            Jot down <kbd className="on-ink">c</kbd>
          </button>
          <button className="btn" onClick={onToday}>Today <kbd>t</kbd></button>
          <Link className={`btn${onMap ? " active" : ""}`} href="/map/">Map <kbd>m</kbd></Link>
          <Link className="btn" href="/?new=1">New note</Link>
          <ImportButton />
        </div>

        <NavList title="Recently edited" items={v.recent} current={current} empty="Notes you write show up here." />
        <NavList title="Journal" items={v.journal} current={current} limit={5} />
        <NavList title="Not written yet" items={v.unwritten} current={current} limit={5} />
        <NavList title="Not linked to anything" items={v.orphans} current={current} limit={5} />
      </div>

      <div className="rail-foot">
        <Link className="btn quiet" href="/?scan=1" title="Ask Claude to suggest links for every note">Ask Claude</Link>
        <div className="grow" />
        <button className={`btn icon quiet${v.calm ? " on" : ""}`} onClick={() => v.setCalm(!v.calm)} aria-pressed={v.calm}
          title={v.calm ? "Let the graph move" : "Keep the graph still"} aria-label={v.calm ? "Let the graph move" : "Keep the graph still"}>
          {v.calm
            ? <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            : <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8c1.6-3 3.2-3 4.8 0s3.2 3 4.8 0 2.4-2 3.4-1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
        </button>
        <button className="btn icon quiet" onClick={v.toggleTheme} aria-label="Switch light or dark" title="Switch light or dark">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" /></svg>
        </button>
      </div>
    </nav>
  );
}

/* Quick capture: one box, Enter saves a line to today's journal note. */
export function Capture() {
  const v = useVault();
  const close = () => v.setCapturing(false);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="capture-dialog" role="dialog" aria-label="Jot something down">
        <CaptureBox autoFocus onDone={close} onCancel={close} />
      </div>
    </div>
  );
}

export function CaptureBox({ autoFocus, onDone, onCancel, inline }) {
  const v = useVault();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    if (!text.trim()) return onCancel?.();
    setBusy(true);
    try {
      const r = await api("/api/daily", { method: "POST", body: JSON.stringify({ ...now(), text }) });
      await v.reload();
      setText(""); setBusy(false);
      v.setToast({ text: "Saved to today's note.", id: r.id });
      onDone?.(r.id);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <div className={`capture${inline ? " inline" : ""}`}>
      <div className="tab" style={{ "--c": "var(--t-journal)" }}>Today, {now().date}</div>
      <textarea autoFocus={autoFocus} value={text} aria-label="Jot something down"
        placeholder="What's on your mind? Use [[links]] and #tags if you like."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
          if (e.key === "Escape") onCancel?.();
        }} />
      {error && <div className="note err">{error}</div>}
      <div className="capture-foot">
        <span className="kbd">Enter saves, Shift+Enter adds a line</span>
        {onCancel && !inline && <button className="btn quiet" onClick={onCancel}>Cancel</button>}
        <button className="btn ink" onClick={save} disabled={busy || (inline && !text.trim())}>Save to today</button>
      </div>
    </div>
  );
}

/* ---------- importing documents ---------- */
export function ImportButton({ className = "btn" }) {
  const v = useVault();
  const input = useRef(null);
  return (
    <>
      <button className={className} title="Turn a PDF, Word file, slides or scan into notes"
        onClick={() => (v.imports.available === false ? v.setInstallHelp(true) : input.current.click())}>
        Import
      </button>
      <input ref={input} id="import-picker" type="file" multiple hidden accept={v.imports.accept.join(",")}
        onChange={(e) => { v.importFiles([...e.target.files]); e.target.value = ""; }} />
    </>
  );
}

function ImportTray() {
  const v = useVault();
  const { open } = useOpen();
  if (!v.myJobs.length) return null;
  return (
    <div className="tray" aria-live="polite">
      {v.myJobs.slice(0, 4).map((j) => (
        <div key={j.id} className={`job ${j.state}`}>
          <span className="job-name">{j.title || j.name}</span>
          <span className="job-state">
            {j.state === "queued" && "Waiting to convert"}
            {j.state === "converting" && <><span className="pen" />Converting on this computer</>}
            {j.state === "done" && `Imported${j.parts ? ` as ${j.parts + 1} notes` : ""} in ${j.seconds}s`}
            {j.state === "failed" && `Couldn't import: ${j.error}`}
          </span>
          {j.state === "done"
            ? <button className="btn small" onClick={() => { open(j.note_id); v.dismissJob(j.id); }}>Open</button>
            : j.state === "failed" && <button className="btn small quiet" onClick={() => v.dismissJob(j.id)}>Dismiss</button>}
        </div>
      ))}
    </div>
  );
}

function InstallHelp() {
  const v = useVault();
  const close = () => v.setInstallHelp(false);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="capture-dialog">
        <article className="card install" role="dialog" aria-label="Install Docling">
          <div className="tab" style={{ "--c": "var(--t-source)" }}>Import</div>
          <div className="card-head"><h2>Importing documents needs Docling</h2></div>
          <div className="form">
            <p>Docling turns PDFs, Word files, slides, web pages and scans into notes, entirely on this computer.
              It's a large download (it includes PyTorch), so it isn't installed by default. Install it with:</p>
            <pre>pip install docling</pre>
            <p>Then restart the server. The first import also downloads Docling's layout and text-recognition models, so it takes a little longer.</p>
          </div>
          <div className="card-foot"><button className="btn ink" onClick={close}>Got it</button></div>
        </article>
      </div>
    </div>
  );
}
