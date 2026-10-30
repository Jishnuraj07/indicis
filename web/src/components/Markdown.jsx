import { useMemo } from "react";
import { marked } from "marked";

// Render a note body: [[links]] become clickable, #tags get styled, code spans are left alone.
export default function Markdown({ body, title, ghosts, onOpen }) {
  const html = useMemo(() => {
    let md = body.replace(/^\s*#\s+(.+)\n?/, (m, h) => (h.trim().toLowerCase() === title.toLowerCase() ? "" : m));
    md = md.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => i % 2 ? part : part
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
        (m, t, alias) => `[${(alias || t).trim()}](#note:${encodeURIComponent(t.trim().toLowerCase())})`)
      .replace(/(^|\s)#([A-Za-z][\w-]*)/g, '$1<span class="tag">#$2</span>')).join("");
    const tmp = document.createElement("div");
    tmp.innerHTML = marked.parse(md.trim());
    tmp.querySelectorAll('a[href^="#note:"]').forEach((a) => {
      const id = decodeURIComponent(a.getAttribute("href").slice(6));
      a.className = "wl" + (ghosts.has(id) ? " missing" : "");
      a.dataset.open = id;
    });
    return tmp.innerHTML.trim();
  }, [body, title, ghosts]);

  if (!html) return <div className="ruled prose"><p className="empty-body">Nothing written yet.</p></div>;
  return (
    <div className="ruled prose" dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const a = e.target.closest("a.wl");
        if (a) { e.preventDefault(); onOpen(a.dataset.open); }
      }} />
  );
}
