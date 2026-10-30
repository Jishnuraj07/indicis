"use client";
import { useMemo } from "react";
import { marked } from "marked";

// [[links]] become clickable, #tags get styled, code spans are left alone.
function linkify(md) {
  return md.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => i % 2 ? part : part
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
      (m, t, alias) => `[${(alias || t).trim()}](#note:${encodeURIComponent(t.trim().toLowerCase())})`)
    .replace(/(^|\s)#([A-Za-z][\w-]*)/g, '$1<span class="tag">#$2</span>')).join("");
}

function finish(html, ghosts) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  tmp.querySelectorAll('a[href^="#note:"]').forEach((a) => {
    const id = decodeURIComponent(a.getAttribute("href").slice(6));
    a.className = "wl" + (ghosts.has(id) ? " missing" : "");
    a.dataset.open = id;
  });
  return tmp.innerHTML.trim();
}

const openLink = (onOpen) => (e) => {
  const a = e.target.closest("a.wl");
  if (a) { e.preventDefault(); e.stopPropagation(); onOpen(a.dataset.open); }
};

export default function Markdown({ body, title, ghosts, onOpen }) {
  const html = useMemo(() => {
    const md = body.replace(/^\s*#\s+(.+)\n?/, (m, h) => (h.trim().toLowerCase() === title.toLowerCase() ? "" : m));
    return finish(marked.parse(linkify(md).trim()), ghosts);
  }, [body, title, ghosts]);

  if (!html) return <div className="ruled prose"><p className="empty-body">Nothing written yet.</p></div>;
  return <div className="ruled prose" dangerouslySetInnerHTML={{ __html: html }} onClick={openLink(onOpen)} />;
}

// One line of context (a backlink, a mention, a search hit), with `mark` highlighted.
export function Snippet({ text, ghosts, onOpen, mark }) {
  const html = useMemo(() => {
    let h = finish(marked.parseInline(linkify(text)), ghosts);
    if (mark) {
      const re = new RegExp(`(${mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![^<]*>)`, "ig");
      h = h.replace(re, "<mark>$1</mark>");
    }
    return h;
  }, [text, ghosts, mark]);
  return <span className="snippet" dangerouslySetInnerHTML={{ __html: html }} onClick={openLink(onOpen)} />;
}
