export const TYPES = ["concept", "person", "book", "project", "source", "journal", "note"];

export const typeVar = (t) => "--t-" + (TYPES.includes(t) || t === "missing" ? t : "note");
export const cap = (s) => s[0].toUpperCase() + s.slice(1);
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const noteUrl = (id) => "/api/notes/" + encodeURIComponent(id);

export async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || r.statusText);
  return data;
}

/** Upload a document for import (the raw file as the body, so not through api()). */
export async function upload(file) {
  const r = await fetch("/api/import?name=" + encodeURIComponent(file.name), {
    method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.detail || r.statusText), { status: r.status });
  return data;
}

/** URL for a file stored next to a note (images and originals of imported documents). */
export const fileUrl = (base, rel) => "/api/files/" + [base, rel].filter(Boolean).join("/").split("/").map(encodeURIComponent).join("/");
