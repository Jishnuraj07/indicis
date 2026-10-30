"""Everyday helpers over the vault: backlinks, mentions, search, related notes, rename, daily notes.
Everything here runs locally; nothing is sent anywhere."""
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path

from parser import LINK_RE, note_id, safe_filename

CODE_RE = re.compile(r"```.*?```|`[^`\n]*`", re.S)
FRONT_RE = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n?", re.S)
WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z'-]{2,}")
STOP = set("""the and for are but not you all any can had her was one our out has have this that with from they will
would there their what about which when your into than then them these some could other more also just like only very
been were its it's how who why does did may our over such each most much many make made use used using note notes
""".split())


def _mask(text: str, pattern: re.Pattern) -> str:
    """Blank out regions (keeping offsets) so later searches skip them."""
    return pattern.sub(lambda m: " " * len(m.group(0)), text)


def _clean(line: str, limit: int = 220) -> str:
    line = re.sub(r"^\s*(?:[-*+]|\d+\.)\s+", "", line.strip())
    line = re.sub(r"^#+\s*", "", line)
    return line if len(line) <= limit else line[: limit - 1].rstrip() + "…"


def _around(text: str, start: int, end: int, width: int = 90) -> str:
    """The line containing [start, end), trimmed around the match."""
    ls = text.rfind("\n", 0, start) + 1
    le = text.find("\n", end)
    le = len(text) if le == -1 else le
    a, b = max(ls, start - width), min(le, end + width)
    s = text[a:b].strip()
    return ("…" if a > ls else "") + _clean(s, 400) + ("…" if b < le else "")


def backlinks(notes: dict, nid: str) -> list[dict]:
    """Notes that link here, each with the lines where the link appears."""
    out = []
    for n in notes.values():
        if n["id"] == nid or nid not in {note_id(l) for l in n["links"]}:
            continue
        body = _mask(n["body"], CODE_RE)
        lines = [m for m in LINK_RE.finditer(body) if note_id(m.group(1)) == nid]
        out.append({"id": n["id"], "title": n["title"], "type": n["type"],
                    "snippets": list(dict.fromkeys(_around(n["body"], m.start(), m.end()) for m in lines))[:3]})
    return sorted(out, key=lambda x: x["title"].lower())


def _mention_re(title: str) -> re.Pattern:
    return re.compile(r"(?<![\w\[|])" + re.escape(title) + r"(?![\w\]|])", re.I)


def mentions(notes: dict, nid: str) -> list[dict]:
    """Notes that name this note in plain text but don't link to it."""
    target = notes[nid]
    names = [target["title"]] + target.get("aliases", [])
    names = [x for x in names if len(x) >= 3]
    out = []
    for n in notes.values():
        if n["id"] == nid or nid in {note_id(l) for l in n["links"]}:
            continue
        body = _mask(_mask(n["body"], CODE_RE), LINK_RE)
        for name in names:
            m = _mention_re(name).search(body)
            if m:
                out.append({"id": n["id"], "title": n["title"], "type": n["type"],
                            "snippet": _around(n["body"], m.start(), m.end()), "match": m.group(0)})
                break
    return sorted(out, key=lambda x: x["title"].lower())


def link_mention(path: Path, title: str, name: str | None = None) -> bool:
    """Turn the first plain-text mention of `name` (default: the title) in a file into a [[title]] link."""
    raw = path.read_text(encoding="utf-8")
    masked = _mask(_mask(_mask(raw, FRONT_RE), CODE_RE), LINK_RE)
    m = _mention_re(name or title).search(masked)
    if not m:
        return False
    found = raw[m.start():m.end()]
    link = f"[[{title}]]" if found == title else f"[[{title}|{found}]]"
    path.write_text(raw[: m.start()] + link + raw[m.end():], encoding="utf-8")
    return True


def search(notes: dict, q: str, limit: int = 20) -> list[dict]:
    """Case-insensitive search over titles and note text, title hits first."""
    q = q.strip().lower()
    if not q:
        return []
    hits = []
    for n in notes.values():
        in_title = q in n["title"].lower()
        lines = [l for l in n["body"].splitlines() if q in l.lower() and not l.lstrip().startswith("# ")]
        if not in_title and not lines:
            continue
        # show each line trimmed around the match so the matched words stay visible
        shown = [_around(l, l.lower().index(q), l.lower().index(q) + len(q), 50) for l in lines[:3]]
        hits.append({"id": n["id"], "title": n["title"], "type": n["type"], "in_title": in_title,
                     "lines": shown, "count": len(lines)})
    hits.sort(key=lambda h: (not h["in_title"], -h["count"], h["title"].lower()))
    return hits[:limit]


def _terms(n: dict) -> Counter:
    text = _mask(n["body"], CODE_RE)
    text = LINK_RE.sub(lambda m: " " + m.group(1) + " ", text)
    words = [w.lower().strip("'-") for w in WORD_RE.findall(n["title"] + " " + n["title"] + " " + text)]
    return Counter(w for w in words if w not in STOP and len(w) > 2)


def related(notes: dict, nid: str, limit: int = 5) -> list[dict]:
    """Notes about similar things (TF-IDF cosine similarity), excluding ones already connected."""
    tf = {k: _terms(n) for k, n in notes.items()}
    df = Counter(w for c in tf.values() for w in c)
    N = len(notes)
    idf = {w: math.log((1 + N) / (1 + d)) + 1 for w, d in df.items()}

    def vec(c):
        v = {w: (1 + math.log(f)) * idf[w] for w, f in c.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1
        return {w: x / norm for w, x in v.items()}

    me = vec(tf[nid])
    linked = {note_id(l) for l in notes[nid]["links"]} | {
        k for k, n in notes.items() if nid in {note_id(l) for l in n["links"]}}
    out = []
    for k, c in tf.items():
        if k == nid or k in linked or not c:
            continue
        v = vec(c)
        shared = sorted(set(me) & set(v), key=lambda w: -(me[w] * v[w]))
        score = sum(me[w] * v[w] for w in shared)
        if score > 0.1 and len(shared) >= 2:  # one shared word is usually a coincidence
            out.append({"id": k, "title": notes[k]["title"], "type": notes[k]["type"],
                        "score": round(score, 3), "shared": shared[:4]})
    return sorted(out, key=lambda x: -x["score"])[:limit]


def rename(vault: Path, notes: dict, nid: str, new_title: str) -> Path:
    """Rename a note's file and rewrite every [[link]] that points at it."""
    note = notes[nid]
    old_path = vault / note["file"]
    new_path = old_path.with_name(safe_filename(new_title))
    old_names = [note["title"]] + ([old_path.stem] if old_path.stem != note["title"] else [])
    pattern = re.compile(r"\[\[\s*(" + "|".join(re.escape(x) for x in old_names) + r")\s*((?:#[^\]|]*)?(?:\|[^\]]+)?)\]\]", re.I)
    for n in notes.values():
        p = vault / n["file"]
        raw = p.read_text(encoding="utf-8")
        new = pattern.sub(lambda m: f"[[{new_title}{m.group(2)}]]", raw)
        if p == old_path:
            new = re.sub(r"(?m)^title:\s*.*$", lambda _: f"title: {json.dumps(new_title, ensure_ascii=False)}", new, count=1)
            new = re.sub(r"(?m)^#\s+" + re.escape(note["title"]) + r"\s*$", f"# {new_title}", new, count=1)
        if new != raw:
            p.write_text(new, encoding="utf-8")
    if new_path != old_path:
        old_path.rename(new_path)
    return new_path


def daily(vault: Path, date: str, time: str = "", text: str = "") -> str:
    """Open (creating if needed) journal/<date>.md and append a captured line."""
    folder = vault / "journal"
    folder.mkdir(exist_ok=True)
    path = folder / f"{date}.md"
    if not path.exists():
        path.write_text(f"---\ntype: journal\n---\n# {date}\n\n", encoding="utf-8")
    if text.strip():
        raw = path.read_text(encoding="utf-8")
        if not raw.endswith("\n"):
            raw += "\n"
        lines = text.strip().splitlines()
        entry = f"- {time + ' ' if time else ''}{lines[0]}\n" + "".join(f"  {l}\n" for l in lines[1:])
        path.write_text(raw + entry, encoding="utf-8")
    return note_id(date)


def fingerprint(vault: Path) -> str:
    """Changes whenever any note is added, removed or edited (also from other apps)."""
    h = hashlib.sha1()
    for p in sorted(vault.glob("**/*.md")):
        st = p.stat()
        h.update(f"{p}:{st.st_mtime_ns}:{st.st_size}".encode())
    return h.hexdigest()[:16]
