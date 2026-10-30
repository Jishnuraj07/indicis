# Knowledge Graph

A personal knowledge graph you can see. Notes are Markdown files in `vault/`; `[[wiki-links]]` between them become edges in an interactive graph. Claude can suggest links and tags for any note.

## Run

```
pip install -r requirements.txt
python -m uvicorn server:app --port 8000
```

Open http://localhost:8000.

The UI is a React app in `web/`. A built copy is already in `static/`, so you only need Node to change the UI:

```
cd web
npm install
npm run dev     # live-reloading UI on http://localhost:5173 (keep the Python server running for /api)
npm run build   # writes the finished UI into ../static
```

AI suggestions use the Anthropic API: set `ANTHROPIC_API_KEY` (or sign in with `ant auth login`). Optional env vars: `KG_MODEL` (default `claude-opus-5-5`), `KG_VAULT` (path to another notes folder, e.g. an Obsidian vault).

## Writing notes

- One note per `.md` file; the file name is the title (or set `title:` in front matter).
- Link with `[[Note Title]]` or `[[Note Title|shown text]]`.
- Tag with `#tag`.
- Set `type: concept | person | book | project` in front matter to color the node.

## Everyday use

- **Jot something down:** press `c` (or **Jot down**) and type. Enter saves it as a timestamped line in today's note, `journal/YYYY-MM-DD.md`. Press `t` or **Today** to open today's note.
- **Search everything:** press `/`. Search covers what you wrote, not just titles, and shows the matching lines.
- **Each note shows its context:**
  - **Linked from:** the sentence where each other note links here.
  - **Mentioned without a link:** notes that name this one in plain text. **Link it** turns the mention into a `[[link]]`.
  - **Similar notes:** notes about the same things, found on your computer without AI.
- **Editing:** type `[[` to pick a note title. **Rename** renames the file and updates every link to it. Obsidian-style `aliases:` in front matter count as mentions too.
- **Edits made elsewhere** (Obsidian, a text editor, git) show up within a few seconds.
- **Ask Claude for links** is optional, and it is the only feature that sends a note off your computer.

## Using the graph

- The graph is live physics: cards hang on springy links. Drag a card and its neighbours follow, swing and settle. **Shake up** kicks every card so they rearrange. The wave button keeps the graph still if the motion distracts you.
- Click a card to read and edit it (Ctrl+S saves). Hover shows its neighbours. Press `/` to search.
- Search, filter by type (the legend) or tag, or tick **Local graph** to see only 2 hops around the selected note.
- Dashed nodes are links to notes that don't exist yet; click to create one.
- **Suggest links** asks Claude for links and tags for the open note; **Scan all with AI** does every note. Nothing is written until you click **Add selected**.

## Files

- `server.py`: FastAPI app and REST API
- `parser.py`: reads the vault, builds nodes and edges
- `ai.py`: Claude call that suggests links and tags
- `insights.py`: backlinks, mentions, search, similar notes, rename and daily notes (all local)
- `web/src/components/Graph.jsx`: the physics graph (d3-force, cards and links drawn as DOM and SVG)
- `web/src/components/Panel.jsx`: the note card, editor and Claude suggestions
- `static/`: the built UI that the server serves
