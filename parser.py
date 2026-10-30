"""Read a folder of Markdown notes and turn it into a graph."""
import re
from pathlib import Path

import frontmatter

LINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]")
TAG_RE = re.compile(r"(?<![\w&/])#([A-Za-z][\w-]*)")
CODE_RE = re.compile(r"```.*?```|`[^`\n]*`", re.S)
BAD_CHARS = re.compile(r'[<>:"/\\|?*]')


def note_id(title: str) -> str:
    """Notes are keyed by lower-cased title, like Obsidian links."""
    return title.strip().lower()


def safe_filename(title: str) -> str:
    name = BAD_CHARS.sub("-", title.strip()).strip(". ")
    return (name or "Untitled") + ".md"


def parse_note(path: Path) -> dict:
    post = frontmatter.load(path)
    body = post.content
    text = CODE_RE.sub("", body)
    links = []
    for m in LINK_RE.finditer(text):
        target = m.group(1).strip()
        if target and target not in links:
            links.append(target)
    tags = sorted({t.lower() for t in TAG_RE.findall(text)} | {str(t).lower() for t in post.get("tags", []) or []})
    title = str(post.get("title") or path.stem)
    return {
        "id": note_id(title),
        "title": title,
        "file": path.name,
        "type": str(post.get("type", "note")).lower(),
        "tags": tags,
        "links": links,
        "body": body,
    }


def load_vault(vault: Path) -> dict[str, dict]:
    notes = {}
    for path in sorted(vault.glob("**/*.md")):
        try:
            n = parse_note(path)
        except Exception as e:  # a broken file should not take down the graph
            print(f"skip {path.name}: {e}")
            continue
        n["file"] = str(path.relative_to(vault)).replace("\\", "/")
        notes[n["id"]] = n
    return notes


def build_graph(notes: dict[str, dict]) -> dict:
    nodes, edges, ghosts = [], [], {}
    degree: dict[str, int] = {nid: 0 for nid in notes}
    seen = set()
    for n in notes.values():
        for target in n["links"]:
            tid = note_id(target)
            if tid == n["id"]:
                continue
            if tid not in notes and tid not in ghosts:
                ghosts[tid] = target
                degree[tid] = 0
            key = tuple(sorted((n["id"], tid)))
            if key in seen:
                continue
            seen.add(key)
            degree[n["id"]] += 1
            degree[tid] += 1
            edges.append({"data": {"id": f"{n['id']}->{tid}", "source": n["id"], "target": tid}})
    for n in notes.values():
        nodes.append({"data": {
            "id": n["id"], "label": n["title"], "type": n["type"],
            "tags": n["tags"], "degree": degree[n["id"]], "ghost": False,
        }})
    for gid, title in ghosts.items():
        nodes.append({"data": {
            "id": gid, "label": title, "type": "missing",
            "tags": [], "degree": degree[gid], "ghost": True,
        }})
    return {"nodes": nodes, "edges": edges}
