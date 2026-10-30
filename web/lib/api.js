export const TYPES = ["concept", "person", "book", "project", "journal", "note"];

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
