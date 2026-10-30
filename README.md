# Knowledge Graph

A personal knowledge graph you can see. Notes are Markdown files in `vault/`; `[[wiki-links]]` between them become edges in an interactive graph. Claude can suggest links and tags for any note.

## Run

```
pip install -r requirements.txt
python -m uvicorn server:app --port 8000
```

Open http://localhost:8000.

AI suggestions use the Anthropic API: set `ANTHROPIC_API_KEY` (or sign in with `ant auth login`). Optional env vars: `KG_MODEL` (default `claude-opus-5-5`), `KG_VAULT` (path to another notes folder, e.g. an Obsidian vault).

## Writing notes

- One note per `.md` file; the file name is the title (or set `title:` in front matter).
- Link with `[[Note Title]]` or `[[Note Title|shown text]]`.
- Tag with `#tag`.
- Set `type: concept | person | book | project` in front matter to color the node.

## Using the graph

- Click a node to read and edit it (Ctrl+S saves). Hover shows its neighbours.
- Search, filter by type or tag, or tick **Local graph** to see only 2 hops around the selected note.
- Dashed nodes are links to notes that don't exist yet; click to create one.
- **Suggest links** asks Claude for links and tags for the open note; **Scan all with AI** does every note. Nothing is written until you click **Add selected**.

## Files

- `server.py`: FastAPI app and REST API
- `parser.py`: reads the vault, builds nodes and edges
- `ai.py`: Claude call that suggests links and tags
- `static/index.html`: the graph UI (Cytoscape.js)
