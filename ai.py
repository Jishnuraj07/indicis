"""Ask Claude to suggest links, new concepts and tags for a note."""
import json
import os

import anthropic

MODEL = os.environ.get("KG_MODEL", "claude-opus-5-5")

SCHEMA = {
    "type": "object",
    "properties": {
        "links": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "target": {"type": "string"},
                    "reason": {"type": "string"},
                    "existing": {"type": "boolean"},
                },
                "required": ["target", "reason", "existing"],
                "additionalProperties": False,
            },
        },
        "tags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["links", "tags"],
    "additionalProperties": False,
}

SYSTEM = """You help maintain a personal knowledge graph made of Markdown notes linked with [[wiki-links]].
Given one note and the titles of all notes in the vault, suggest:
- links: up to 8 notes this note should link to. Prefer existing titles (spelled exactly as listed, existing=true).
  You may also propose a few new concept notes worth creating (existing=false) when the note mentions an
  important idea, person, book or project that has no note yet. Give a short reason for each.
  Never suggest a note it already links to, or the note itself.
- tags: up to 5 short lowercase tags (no #) that fit the note and are not already on it.
Return only what is genuinely useful; empty lists are fine."""


class AIError(Exception):
    pass


_client = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def suggest(note: dict, all_titles: list[str]) -> dict:
    others = [t for t in all_titles if t.lower() != note["title"].lower()]
    prompt = (
        f"<vault_titles>\n{chr(10).join(others)}\n</vault_titles>\n\n"
        f"<note title=\"{note['title']}\">\n{note['body']}\n</note>\n\n"
        f"Already links to: {', '.join(note['links']) or 'nothing'}\n"
        f"Already tagged: {', '.join(note['tags']) or 'nothing'}"
    )
    try:
        response = client().beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        raise AIError("No valid API key. Set ANTHROPIC_API_KEY and restart the server.")
    except anthropic.RateLimitError:
        raise AIError("Rate limited by the API. Try again in a minute.")
    except anthropic.APIStatusError as e:
        raise AIError(f"API error {e.status_code}: {e.message}")
    except anthropic.APIConnectionError:
        raise AIError("Could not reach the Claude API. Check your internet connection.")
    except TypeError:  # no credentials configured at all
        raise AIError("Claude isn't set up yet. Set ANTHROPIC_API_KEY (or run `ant auth login`), then restart the server.")

    if response.stop_reason == "refusal":
        raise AIError("Claude declined to analyse this note.")
    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise AIError("Claude returned an unreadable answer; try again.")

    have = {l.lower() for l in note["links"]} | {note["title"].lower()}
    lookup = {t.lower(): t for t in all_titles}
    links, seen = [], set()
    for s in data.get("links", []):
        key = s["target"].strip().lower()
        if not key or key in have or key in seen:
            continue
        seen.add(key)
        links.append({
            "target": lookup.get(key, s["target"].strip()),
            "reason": s["reason"],
            "existing": key in lookup,
        })
    tags = [t.strip().lstrip("#").lower().replace(" ", "-") for t in data.get("tags", [])]
    tags = [t for t in dict.fromkeys(tags) if t and t not in note["tags"]]
    return {"links": links, "tags": tags}
