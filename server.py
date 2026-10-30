"""Personal knowledge graph: FastAPI server over a folder of Markdown notes."""
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import ai
from parser import build_graph, load_vault, note_id, safe_filename

ROOT = Path(__file__).parent
VAULT = Path(os.environ.get("KG_VAULT", ROOT / "vault")).resolve()
VAULT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Knowledge Graph")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


class NewNote(BaseModel):
    title: str
    type: str = "note"
    body: str = ""


class SaveNote(BaseModel):
    raw: str


class Accept(BaseModel):
    links: list[str] = []
    tags: list[str] = []


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


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/graph")
def graph():
    return build_graph(load_vault(VAULT))


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
    front = f"---\ntitle: {title}\ntype: {data.type}\n---\n" if path.stem != title else f"---\ntype: {data.type}\n---\n"
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
