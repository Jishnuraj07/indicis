# Knowledge Graph

A personal knowledge graph you can see. Notes are Markdown files in `vault/`; `[[wiki-links]]` between them become edges in an interactive graph. Claude can suggest links and tags for any note.

## Run

```
pip install -r requirements.txt
python -m uvicorn server:app --port 8000
```

Open http://localhost:8000.

The UI is a Next.js app in `web/`. It's exported as static files, and a built copy is already in `static/`, so you only need Node to change the UI:

```
cd web
npm install
npm run dev     # live-reloading UI on http://localhost:3000 (keep the Python server running for /api)
npm run build   # exports the finished UI into ../static
```

## Layout

- **Left rail:** search (`/` or Ctrl+K), Jot down, Today, Map and New note, plus lists of recently edited notes, journal days, notes not written yet, and notes with no links.
- **Desk (home):** a box to jot into today's note, what you've written today, and the cards you touched last.
- **Note page:** the note on a ruled card in the middle. On the right are its nearby notes as a small live graph, and what links to it, mentions it or resembles it.
- **Map** (`m`): every note as a physics graph. Click a card to peek at it.
- **URLs:** each note has its own address (`/?n=note-title`), so the back button and bookmarks work.

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
- `web/app/`: the Next.js pages (`page.jsx` for the desk and notes, `map/page.jsx` for the map) and `globals.css`
- `web/components/Shell.jsx`: the rail, quick capture and hotkeys; `Palette.jsx`: search and commands
- `web/components/Workspace.jsx`: the desk and note page; `MapView.jsx`: the map
- `web/components/Graph.jsx`: the physics graph (d3-force, cards and links drawn as DOM and SVG)
- `web/components/Panel.jsx`: the note card, context lists, editor and Claude suggestions
- `web/lib/vault.js`: shared state for all pages (notes, live refresh, settings)
- `static/`: the built UI that the server serves
