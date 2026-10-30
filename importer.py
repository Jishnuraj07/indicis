"""Turn documents (PDF, Word, slides, web pages, scans...) into notes, using Docling on this computer.

Docling is optional: without it the rest of the app works and imports explain how to install it.
Each document becomes a folder in vault/sources/ holding the original file, its images, and one
note, or for long documents a contents note plus one note per section.
"""
import importlib.util
import json
import re
import shutil
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from parser import load_vault, note_id, safe_filename

ACCEPT = {".pdf", ".docx", ".pptx", ".xlsx", ".html", ".htm", ".xhtml", ".epub", ".odt", ".odp", ".ods",
          ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp", ".md", ".txt", ".csv", ".tex"}
MAX_BYTES = 200 * 1024 * 1024
SPLIT_WORDS = 3000  # longer documents are split into section notes
PART_WORDS = 600    # small sections are grouped until a part has at least this many words


def available() -> bool:
    return importlib.util.find_spec("docling") is not None


def _words(text: str) -> int:
    return len(re.findall(r"\w+", text))


def _fm(**fields) -> str:
    # JSON strings are valid YAML, so titles with colons or quotes stay safe
    lines = [f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in fields.items() if v not in (None, "")]
    return "---\n" + "\n".join(lines) + "\n---\n"


def _title_from(md: str, path: Path) -> str:
    m = re.search(r"(?m)^#{1,2}\s+(.+?)\s*$", md)
    if m and 3 <= len(m.group(1)) <= 120:
        return m.group(1).strip()
    return re.sub(r"[_-]+", " ", path.stem).strip() or "Imported document"


def _unique_title(title: str, taken: set[str]) -> str:
    if note_id(title) not in taken:
        return title
    for i in range(2, 100):
        t = f"{title} ({i})"
        if note_id(t) not in taken:
            return t
    return f"{title} ({uuid.uuid4().hex[:6]})"


def split_sections(md: str, title: str = "") -> tuple[str, list[tuple[str, str]]]:
    """Split Markdown at its section headings: (text before the first section, [(heading, text)])."""
    level = "##" if re.search(r"(?m)^## ", md) else "#"
    preface, sections = "", []
    for piece in re.split(rf"(?m)^(?={level} )", md):
        if piece.startswith(level + " "):
            heading = piece.split("\n", 1)[0][len(level):].strip()
            if not sections and heading.lower() == title.lower():
                preface += piece  # the document's own title, not a section
            else:
                sections.append((heading, piece))
        elif piece.strip():
            preface += piece
    return preface, sections


def group_parts(sections: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Merge short sections so each part is worth reading on its own."""
    parts, heading, buf = [], None, []
    for h, text in sections:
        if heading is None:
            heading = h
        buf.append(text)
        if _words("\n".join(buf)) >= PART_WORDS:
            parts.append((heading, "\n".join(buf)))
            heading, buf = None, []
    if buf:
        if parts and _words("\n".join(buf)) < PART_WORDS // 2:
            parts[-1] = (parts[-1][0], parts[-1][1] + "\n" + "\n".join(buf))
        else:
            parts.append((heading, "\n".join(buf)))
    return parts


def write_notes(vault: Path, folder: Path, title: str, md: str, original: str, pages: int | None) -> tuple[str, int]:
    """Write the converted Markdown as notes. Returns (id of the main note, number of section notes)."""
    taken = set(load_vault(vault))
    title = _unique_title(title, taken)
    taken.add(note_id(title))
    today = date.today().isoformat()
    origin = f"Imported from [{original}](<{original}>) on {today}" + (f", {pages} page{'s' if pages != 1 else ''}." if pages else ".")

    preface, sections = split_sections(md, title)
    if _words(md) < SPLIT_WORDS or len(sections) < 3:
        body = re.sub(r"(?m)\A\s*#{1,2}\s+.+\n", "", md, count=1).strip()
        (folder / safe_filename(title)).write_text(
            _fm(title=title, type="source", source_file=original, imported=today)
            + f"# {title}\n\n{origin}\n\n{body}\n", encoding="utf-8")
        return note_id(title), 0

    parts = group_parts(sections)
    part_titles = []
    for heading, text in parts:
        pt = _unique_title(f"{title}: {heading}" if heading else title, taken)
        taken.add(note_id(pt))
        part_titles.append(pt)
        text = re.sub(r"(?m)\A#{1,2}\s+.+\n", "", text, count=1).strip()
        (folder / safe_filename(pt)).write_text(
            _fm(title=pt, type="source", part_of=title, source_file=original, imported=today)
            + f"# {pt}\n\nPart of [[{title}]]\n\n{text}\n", encoding="utf-8")

    intro = re.sub(r"(?m)^#{1,2}\s+.+\n", "", preface, count=1).strip()
    contents = "\n".join(f"- [[{pt}]]" for pt in part_titles)
    (folder / safe_filename(title)).write_text(
        _fm(title=title, type="source", source_file=original, imported=today)
        + f"# {title}\n\n{origin}\n\n" + (f"{intro}\n\n" if intro else "") + f"## Contents\n\n{contents}\n",
        encoding="utf-8")
    return note_id(title), len(part_titles)


class Importer:
    """Runs conversions one at a time in the background and remembers recent jobs."""

    def __init__(self, vault: Path):
        self.vault = vault
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="import")
        self._converter = None

    def submit(self, filename: str, data: bytes) -> dict:
        inbox = Path(tempfile.mkdtemp(prefix="kg-import-"))
        path = inbox / Path(filename).name
        path.write_bytes(data)
        job = {"id": uuid.uuid4().hex[:12], "name": path.name, "state": "queued", "created": time.time(),
               "note_id": None, "parts": 0, "error": None, "seconds": None}
        with self.lock:
            self.jobs[job["id"]] = job
        self.pool.submit(self._run, job, path)
        return job

    def list(self) -> list[dict]:
        with self.lock:
            return sorted((dict(j) for j in self.jobs.values()), key=lambda j: -j["created"])[:20]

    def converter(self):
        if self._converter is None:
            # imported lazily: loading Docling and its models takes a while
            from docling.datamodel.base_models import InputFormat
            from docling.datamodel.pipeline_options import PdfPipelineOptions
            from docling.document_converter import DocumentConverter, PdfFormatOption

            pdf = PdfPipelineOptions()
            pdf.generate_picture_images = True  # keep figures as images next to the note
            pdf.images_scale = 2.0
            self._converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pdf)})
        return self._converter

    def _set(self, job, **kw):
        with self.lock:
            job.update(kw)

    def _run(self, job: dict, path: Path):
        start = time.time()
        self._set(job, state="converting")
        folder = None
        try:
            from docling_core.types.doc import ImageRefMode

            result = self.converter().convert(path)
            doc = result.document
            md_preview = doc.export_to_markdown()
            title = _title_from(md_preview, path)

            sources = self.vault / "sources"
            sources.mkdir(exist_ok=True)
            folder = sources / safe_filename(title)[:-3]
            n = 2
            while folder.exists():
                folder = sources / f"{safe_filename(title)[:-3]} ({n})"
                n += 1
            folder.mkdir()

            # Docling writes the figures into images/ and links them from the Markdown
            tmp_md = folder / "_converted.md.tmp"
            doc.save_as_markdown(tmp_md, artifacts_dir=Path("images"), image_mode=ImageRefMode.REFERENCED)
            md = tmp_md.read_text(encoding="utf-8")
            tmp_md.unlink()

            shutil.move(str(path), folder / path.name)
            pages = len(doc.pages) if getattr(doc, "pages", None) else None
            nid, parts = write_notes(self.vault, folder, title, md, path.name, pages)
            self._set(job, state="done", note_id=nid, parts=parts, title=title, seconds=round(time.time() - start, 1))
        except Exception as e:  # report any failure on the job instead of losing it in a thread
            if folder and folder.exists() and not any(folder.glob("*.md")):
                shutil.rmtree(folder, ignore_errors=True)
            self._set(job, state="failed", error=f"{type(e).__name__}: {e}"[:400], seconds=round(time.time() - start, 1))
        finally:
            shutil.rmtree(path.parent, ignore_errors=True)
