# Changelog

All notable changes to Indicis are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [0.1.0] - 2026-10-31

The first public release.

### Writing and capture
- Notes are plain Markdown files in `vault/`, compatible with Obsidian (`[[wiki-links]]`, `#tags`, front matter with `type`, `tags` and `aliases`).
- A desk home page with an inline capture box, today's journal entries and recently edited notes.
- Quick capture from anywhere (`c`) into a daily note at `journal/YYYY-MM-DD.md`, and a hotkey for today's note (`t`).
- An editor that suggests note titles after `[[`, and rename that rewrites every link to the note.

### Finding and connecting
- A command palette (`/` or `Ctrl+K`) for full-text search and commands.
- Backlinks shown with the sentence around each link.
- Unlinked mentions, which turn into links with one click.
- Similar notes, found locally with TF-IDF.
- Lists of notes not written yet and notes linked to nothing.

### The graph
- A live physics graph built on d3-force: cards hang on springy links, swing when dragged, and settle.
- A local graph beside each note that follows the open note, and a full-screen map with filters and previews.
- A switch to keep the graph still, and support for the reduced-motion setting.

### Importing documents
- Import PDF, Word, PowerPoint, Excel, HTML, EPUB and scanned images as notes, converted on your computer by Docling (optional install).
- Long documents become a contents note plus linked section notes. Figures and the original file are kept next to them.

### AI (optional)
- Claude suggests links, new notes and tags for one note or all notes. Nothing is written until you approve it.

### Under the hood
- A FastAPI server, plus a Next.js 16 interface exported as static files: one command runs everything.
- Edits made in other apps appear within a few seconds.
- Fonts are bundled, so the app makes no outside requests unless you use Claude.

[0.1.0]: https://github.com/Jishnuraj07/indicis/releases/tag/v0.1.0
