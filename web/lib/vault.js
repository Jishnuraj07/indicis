"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { TYPES, api, upload } from "./api.js";

const VaultContext = createContext(null);
export const useVault = () => useContext(VaultContext);

const pad = (n) => String(n).padStart(2, "0");
export const now = () => {
  const d = new Date();
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

/** A setting kept in this browser (read after mount so server and client render the same first frame). */
export function useStored(key, initial) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(key)); if (v !== null) setValue(v); } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => { if (ready) try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value, ready]);
  return [value, setValue];
}

/** Everything the pages share: the graph of notes, live refresh, and app-wide switches. */
export function VaultProvider({ children }) {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(null);
  const [theme, setTheme] = useStored("kg-theme", null);
  const [calm, setCalm] = useStored("kg-calm", false);
  const [capturing, setCapturing] = useState(false);
  const [palette, setPalette] = useState(false);
  const [toast, setToast] = useState(null);
  const [imports, setImports] = useState({ available: null, jobs: [], accept: [] });
  const [mine, setMine] = useState([]); // import jobs started from this window, shown in the tray
  const [installHelp, setInstallHelp] = useState(false);
  const jobStates = useRef(new Map());

  const reload = useCallback(async () => {
    const g = await api("/api/graph");
    setGraph({ nodes: g.nodes.map((n) => n.data), edges: g.edges.map((e) => e.data) });
    setLoaded(true);
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

  /* ---------- importing documents (converted on this computer by Docling) ---------- */
  const refreshImports = useCallback(async () => {
    try {
      const st = await api("/api/import");
      setImports(st);
      for (const j of st.jobs) {
        const before = jobStates.current.get(j.id);
        jobStates.current.set(j.id, j.state);
        if (before && before !== "done" && j.state === "done") {
          await reload();
          setToast({ text: `Imported ${j.title || j.name}${j.parts ? ` as ${j.parts + 1} notes` : ""}.`, id: j.note_id });
        }
      }
    } catch {}
  }, [reload]);
  useEffect(() => { refreshImports(); }, [refreshImports]);
  const busy = imports.jobs.some((j) => mine.includes(j.id) && (j.state === "queued" || j.state === "converting"));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(refreshImports, 1500);
    return () => clearInterval(t);
  }, [busy, refreshImports]);

  const importFiles = async (files) => {
    if (imports.available === false) return setInstallHelp(true);
    for (const f of files) {
      try {
        const job = await upload(f);
        jobStates.current.set(job.id, job.state);
        setMine((m) => [job.id, ...m]);
      } catch (e) {
        if (e.status === 503) { setInstallHelp(true); break; }
        setToast({ text: `${f.name}: ${e.message}` });
      }
    }
    refreshImports();
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
  }, [theme]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);

  const derived = useMemo(() => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
    for (const e of graph.edges) { adj.get(e.source)?.add(e.target); adj.get(e.target)?.add(e.source); }
    const notes = graph.nodes.filter((n) => !n.ghost);
    const present = new Set(graph.nodes.map((n) => n.type));
    const extra = [...present].filter((t) => !TYPES.includes(t) && t !== "missing").sort();
    return {
      byId, adj, notes,
      ghosts: new Set(graph.nodes.filter((n) => n.ghost).map((n) => n.id)),
      titles: graph.nodes.map((n) => n.label).sort((a, b) => a.localeCompare(b)),
      tags: [...new Set(graph.nodes.flatMap((n) => n.tags))].sort(),
      types: [...[...TYPES, ...extra].filter((t) => present.has(t)), ...(present.has("missing") ? ["missing"] : [])],
      recent: notes.filter((n) => n.type !== "journal").sort((a, b) => b.mtime - a.mtime),
      journal: notes.filter((n) => n.type === "journal").sort((a, b) => b.label.localeCompare(a.label)),
      orphans: notes.filter((n) => n.degree === 0 && n.type !== "journal"),
      unwritten: graph.nodes.filter((n) => n.ghost),
    };
  }, [graph]);

  const toggleTheme = () => {
    const dark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(dark ? "light" : "dark");
  };

  const value = {
    graph, loaded, reload, version, ...derived,
    calm, setCalm, toggleTheme,
    capturing, setCapturing, palette, setPalette, toast, setToast,
    imports, importFiles, installHelp, setInstallHelp,
    myJobs: mine.map((id) => imports.jobs.find((j) => j.id === id)).filter(Boolean),
    dismissJob: (id) => setMine((m) => m.filter((x) => x !== id)),
  };
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
