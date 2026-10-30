"""Personal knowledge graph: FastAPI server over a folder of Markdown notes."""
import json
import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import ai
import importer
import insights
from parser import build_graph, load_vault, note_id, safe_filename

ROOT = Path(__file__).parent
VAULT = Path(os.environ.get("KG_VAULT", ROOT / "vault")).resolve()
VAULT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Knowledge Graph")
imports = importer.Importer(VAULT)


@app.middleware("http")
async def fresh_pages(request, call_next):
    """Pages always revalidate so a rebuilt UI shows up; hashed assets can be cached."""
    response = await call_next(request)
    if response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Cache-Control"] = "no-cache"
    return response


class NewNote(BaseModel):
    title: str
    type: str = "note"
    body: str = ""


class SaveNote(BaseModel):
    raw: str


class Accept(BaseModel):
    links: list[str] = []
    tags: list[str] = []


class Capture(BaseModel):
    date: str  # the browser's local date, so "today" matches the user's clock
    time: str = ""
    text: str = ""


class LinkMention(BaseModel):
    source: str


class Rename(BaseModel):
    title: str


def get_note(nid: str) -> dict:
    notes = load_vault(VAULT)
    note = notes.get(note_id(nid))
    if not note:
        raise HTTPException(404, f"No note '{nid}'")
    return note


def note_path(note: dict) -> Path:
    path = (VAULT / note["file"]).resolve()
    if VAULT not in path.parents:
        raise HTTPException(400, "Bad path")
    return path


@app.get("/api/graph")
def graph():
    return build_graph(load_vault(VAULT))


@app.get("/api/version")
def version():
    return {"version": insights.fingerprint(VAULT)}


@app.get("/api/search")
def search(q: str = ""):
    return insights.search(load_vault(VAULT), q)


@app.post("/api/daily")
def daily(data: Capture):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data.date):
        raise HTTPException(400, "Date must look like 2026-10-30")
    return {"id": insights.daily(VAULT, data.date, data.time, data.text)}


@app.get("/api/import")
def import_status():
    return {"available": importer.available(), "jobs": imports.list(), "accept": sorted(importer.ACCEPT)}


@app.post("/api/import")
async def import_document(request: Request, name: str):
    """Queue a document for conversion into notes. The body is the raw file; Docling runs on this computer."""
    if not importer.available():
        raise HTTPException(503, "Document import needs Docling. Run: pip install docling, then restart the server.")
    name = Path(name).name or "document"
    if Path(name).suffix.lower() not in importer.ACCEPT:
        raise HTTPException(415, f"Can't import {Path(name).suffix or 'files without an extension'}. "
                                 "Try PDF, Word, PowerPoint, Excel, HTML, EPUB or an image.")
    if int(request.headers.get("content-length") or 0) > importer.MAX_BYTES:
        raise HTTPException(413, "That file is over 200 MB.")
    data = await request.body()
    if len(data) > importer.MAX_BYTES:
        raise HTTPException(413, "That file is over 200 MB.")
    return imports.submit(name, data)


@app.get("/api/files/{rel:path}")
def vault_file(rel: str):
    """Images and original files stored alongside notes (for imported documents)."""
    path = (VAULT / rel).resolve()
    if VAULT not in path.parents or not path.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(path)


# These must come before the catch-all GET /api/notes/{nid:path} below.
@app.get("/api/notes/{nid:path}/context")
def context(nid: str):
    notes = load_vault(VAULT)
    nid = note_id(nid)
    if nid not in notes:
        raise HTTPException(404, f"No note '{nid}'")
    return {
        "backlinks": insights.backlinks(notes, nid),
        "mentions": insights.mentions(notes, nid),
        "related": insights.related(notes, nid),
    }


@app.get("/api/notes/{nid:path}")
def read_note(nid: str):
    note = get_note(nid)
    raw = note_path(note).read_text(encoding="utf-8")
    return {**note, "raw": raw}


@app.put("/api/notes/{nid:path}")
def save_note(nid: str, data: SaveNote):
    note = get_note(nid)
    note_path(note).write_text(data.raw, encoding="utf-8")
    return {"ok": True}


@app.post("/api/notes")
def create_note(data: NewNote):
    title = data.title.strip()
    if not title:
        raise HTTPException(400, "Title is required")
    if note_id(title) in load_vault(VAULT):
        raise HTTPException(409, f"'{title}' already exists")
    path = VAULT / safe_filename(title)
    if path.exists():
        raise HTTPException(409, f"File {path.name} already exists")
    front = f"---\ntitle: {json.dumps(title, ensure_ascii=False)}\ntype: {data.type}\n---\n" if path.stem != title else f"---\ntype: {data.type}\n---\n"
    path.write_text(f"{front}# {title}\n\n{data.body}\n", encoding="utf-8")
    return {"id": note_id(title)}


@app.post("/api/notes/{nid:path}/suggest")
def suggest(nid: str):
    note = get_note(nid)
    titles = [n["title"] for n in load_vault(VAULT).values()]
    try:
        return ai.suggest(note, titles)
    except ai.AIError as e:
        raise HTTPException(502, str(e))


@app.post("/api/notes/{nid:path}/accept")
def accept(nid: str, data: Accept):
    note = get_note(nid)
    path = note_path(note)
    raw = path.read_text(encoding="utf-8").rstrip()
    have = {l.lower() for l in note["links"]}
    links = [l for l in data.links if l.lower() not in have]
    tags = [t for t in data.tags if t.lower() not in note["tags"]]
    if links:
        raw += "\n\nRelated: " + ", ".join(f"[[{l}]]" for l in links)
    if tags:
        raw += "\n\n" + " ".join(f"#{t}" for t in tags)
    path.write_text(raw + "\n", encoding="utf-8")
    return {"added_links": links, "added_tags": tags}


@app.post("/api/notes/{nid:path}/link-mention")
def link_mention(nid: str, data: LinkMention):
    """In note `data.source`, turn the plain mention of this note into a [[link]]."""
    notes = load_vault(VAULT)
    target, source = notes.get(note_id(nid)), notes.get(note_id(data.source))
    if not target or not source:
        raise HTTPException(404, "Note not found")
    path = note_path(source)
    for name in [target["title"]] + target["aliases"]:
        if insights.link_mention(path, target["title"], name):
            return {"ok": True}
    raise HTTPException(409, f"'{source['title']}' no longer mentions '{target['title']}'")


@app.post("/api/notes/{nid:path}/rename")
def rename(nid: str, data: Rename):
    notes = load_vault(VAULT)
    note = notes.get(note_id(nid))
    title = data.title.strip()
    if not note:
        raise HTTPException(404, f"No note '{nid}'")
    if not title:
        raise HTTPException(400, "Title is required")
    if note_id(title) in notes and note_id(title) != note["id"]:
        raise HTTPException(409, f"'{title}' already exists")
    new_path = (VAULT / note["file"]).with_name(safe_filename(title))
    if new_path.exists() and new_path.resolve() != note_path(note):
        raise HTTPException(409, f"File {new_path.name} already exists")
    insights.rename(VAULT, notes, note["id"], title)
    return {"id": note_id(title)}


# The UI: a static export of the Next.js app in web/ (built into static/). Mounted last so /api wins.
app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="ui")
