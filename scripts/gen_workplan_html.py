#!/usr/bin/env python3
"""Generate a phone-first, color-coded HTML board from WORKPLAN.md.

Option B: WORKPLAN.md stays the editable source of truth. WORKPLAN.html is
GENERATED from it (never hand-edited) so the two can't drift.

Design / aesthetic lifted from the hand-built spec
``~/Peripheral-Brain/Scratch/workplan-live.html`` (dark, phone-first,
color-coded status pills, done = struck + dimmed, collapsible <details>
sections, a "Where we are now" banner pinned at the top).

The generator is intentionally a small, dependency-free markdown subset
renderer. The HARD requirement is CONTENT COVERAGE: every heading and bullet
in the markdown must survive into the HTML. Status styling (strike, pills,
collapse) is best-effort on top of that — any line that doesn't match a known
convention still renders readably as a paragraph or list item.

Usage:
    python scripts/gen_workplan_html.py            # WORKPLAN.md -> WORKPLAN.html
    python scripts/gen_workplan_html.py --check     # exit 1 if HTML is stale

Run from the repo root (mn-ccore-lab).
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "WORKPLAN.md"
OUT = REPO_ROOT / "WORKPLAN.html"

# ---------------------------------------------------------------------------
# Status detection conventions (learned from the real WORKPLAN.md structure).
# ---------------------------------------------------------------------------
# A line/item is DONE if it carries any of these markers.
DONE_MARKERS = ("✅", "✓", "☑")  # check / checkmark / ballot-box-check
DONE_WORDS = re.compile(r"\b(DONE|SHIPPED|DROPPED|RESOLVED|COMPLETE|COMPLETED)\b")
# NEXT / in-progress markers.
NEXT_MARKER = "▶"  # right-pointing triangle
NEXT_WORDS = re.compile(r"\bNEXT\b|\bNEXT—|Immediate next")
PROG_MARKERS = ("⏳", "◐", "◑")  # hourglass / half circles
# BLOCKER markers.
BLOCK_MARKER = "⚠"  # warning sign
BLOCK_WORDS = re.compile(r"\bBLOCK(ED|S|ER)?\b|premature enforce")
# Priority lines (north-star block): P0', P1..P4, leading star.
PRIORITY_LINE = re.compile(r"^\*\*(P0′|P[0-9]+)\b")
STAR = "★"

# Section headings (## ...) whose CONTENT should start collapsed because the
# work is finished / archival. Matched case-insensitively as a substring of
# the heading text.
COLLAPSE_HEADING_HINTS = (
    "done ledger",
    "all done",
    "graduated items",  # codex review block — historical record
    "the t1 correctness directive",  # DONE 2026-05-22 PM record
)
# A heading is also collapsed if it itself carries a done marker / DONE word.


def is_done_text(text: str) -> bool:
    if any(m in text for m in DONE_MARKERS):
        return True
    # Only treat the WORD forms as "done" when they appear as a status, not
    # mid-sentence noise. The marker check above handles the common case.
    return False


def classify_block_tag(text: str):
    """Return (css_class, label) for a status pill, or None."""
    if any(m in text for m in DONE_MARKERS) or DONE_WORDS.search(text):
        return ("t-prog", "done")
    if NEXT_MARKER in text or NEXT_WORDS.search(text):
        return ("t-next", "next")
    if BLOCK_MARKER in text or BLOCK_WORDS.search(text):
        return ("t-block", "blocks")
    if any(m in text for m in PROG_MARKERS):
        return ("t-prog", "in progress")
    return None


# ---------------------------------------------------------------------------
# Inline markdown -> HTML (bold, code, links). Everything is escaped first.
# ---------------------------------------------------------------------------
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_ITALIC_RE = re.compile(r"(?<![\*\w])\*([^*\n]+?)\*(?!\*)")
_CODE_RE = re.compile(r"`([^`]+)`")


def render_inline(text: str) -> str:
    """Escape, then re-introduce a safe markdown subset as HTML."""
    # Protect inline code spans first so their contents aren't mangled.
    code_spans: list[str] = []

    def _stash_code(m: re.Match) -> str:
        code_spans.append(m.group(1))
        return f"\x00CODE{len(code_spans) - 1}\x00"

    tmp = _CODE_RE.sub(_stash_code, text)
    tmp = html.escape(tmp, quote=False)

    # Links: [label](url) -> <a>. Escape both parts.
    def _link(m: re.Match) -> str:
        label = m.group(1)
        url = m.group(2)
        # url already escaped by html.escape above (it ran on tmp).
        return f'<a href="{url}" target="_blank" rel="noopener">{label}</a>'

    tmp = _LINK_RE.sub(_link, tmp)
    tmp = _BOLD_RE.sub(r"<b>\1</b>", tmp)
    tmp = _ITALIC_RE.sub(r"<em>\1</em>", tmp)

    # Restore code spans, escaped, wrapped in <code>.
    def _restore_code(m: re.Match) -> str:
        idx = int(m.group(1))
        return f"<code>{html.escape(code_spans[idx], quote=False)}</code>"

    tmp = re.sub(r"\x00CODE(\d+)\x00", _restore_code, tmp)
    return tmp


# ---------------------------------------------------------------------------
# Block parsing. We walk the markdown line-by-line into a list of "blocks":
# headings, paragraphs, bullet lists (with nesting), blockquotes, hr.
# ---------------------------------------------------------------------------
class Block:
    __slots__ = ("kind", "level", "text", "children")

    def __init__(self, kind, level=0, text="", children=None):
        self.kind = kind          # 'h1','h2','para','hr','quote','li'
        self.level = level        # heading level OR list indent depth
        self.text = text
        self.children = children if children is not None else []


def parse_blocks(md: str) -> list[Block]:
    lines = md.splitlines()
    blocks: list[Block] = []
    i = 0
    n = len(lines)
    while i < n:
        raw = lines[i]
        stripped = raw.strip()

        # Horizontal rule.
        if re.fullmatch(r"-{3,}", stripped):
            blocks.append(Block("hr"))
            i += 1
            continue

        # Heading.
        m = re.match(r"^(#{1,6})\s+(.*)$", raw)
        if m:
            level = len(m.group(1))
            blocks.append(Block(f"h{level}", level=level, text=m.group(2).strip()))
            i += 1
            continue

        # Blockquote (may span multiple lines; join them).
        if stripped.startswith(">"):
            quote_lines = []
            while i < n and lines[i].strip().startswith(">"):
                quote_lines.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            blocks.append(Block("quote", text="\n".join(quote_lines).strip()))
            continue

        # List item (bulleted). Capture indent for nesting. Continuation lines
        # (indented, not a new bullet) are folded into the same item so prose
        # that wraps under a bullet isn't lost.
        lm = re.match(r"^(\s*)([-*])\s+(.*)$", raw)
        if lm:
            indent = len(lm.group(1).expandtabs(4))
            text = lm.group(3)
            depth = indent // 2  # 0, 1, 2 ... rough nesting
            j = i + 1
            cont = []
            while j < n:
                nxt = lines[j]
                if not nxt.strip():
                    break
                # Stop if next line is a new bullet or a heading or hr.
                if re.match(r"^\s*[-*]\s+", nxt) or re.match(r"^#{1,6}\s", nxt) or \
                   re.fullmatch(r"-{3,}", nxt.strip()):
                    break
                # Continuation line (indented more than the bullet marker).
                if len(nxt) - len(nxt.lstrip()) > indent:
                    cont.append(nxt.strip())
                    j += 1
                else:
                    break
            if cont:
                text = text + " " + " ".join(cont)
            blocks.append(Block("li", level=depth, text=text.strip()))
            i = j
            continue

        # Blank line.
        if not stripped:
            i += 1
            continue

        # Plain paragraph (fold soft-wrapped continuation lines).
        para_lines = [stripped]
        j = i + 1
        while j < n:
            nxt = lines[j]
            s = nxt.strip()
            if not s:
                break
            if re.match(r"^#{1,6}\s", nxt) or re.match(r"^\s*[-*]\s+", nxt) or \
               s.startswith(">") or re.fullmatch(r"-{3,}", s):
                break
            para_lines.append(s)
            j += 1
        blocks.append(Block("para", text=" ".join(para_lines)))
        i = j
    return blocks


# ---------------------------------------------------------------------------
# HTML emission. Group blocks under their nearest preceding ## heading into
# "sections" so we can collapse completed ones.
# ---------------------------------------------------------------------------
def icon_for(text: str) -> str:
    if any(m in text for m in DONE_MARKERS):
        return "✓"
    if NEXT_MARKER in text or NEXT_WORDS.search(text):
        return "▶"
    if BLOCK_MARKER in text:
        return "⚠"
    if any(m in text for m in PROG_MARKERS):
        return "◐"
    if PRIORITY_LINE.match(text):
        return "◆"
    if text.lstrip().startswith(STAR):
        return "★"
    return "○"  # open circle = todo


def emit_li(b: Block) -> str:
    """A list item becomes a .row card; done items get the .done treatment."""
    text = b.text
    done = is_done_text(text)
    tag = classify_block_tag(text)
    indent_px = 6 + b.level * 16
    cls = "row done" if done else "row"
    ic = icon_for(text)
    inner = render_inline(text)
    tag_html = ""
    if tag and not done:
        tag_html = f'<div class="tag {tag[0]}">{tag[1]}</div>'
    elif tag and done:
        tag_html = f'<div class="tag t-prog">{tag[1]}</div>'
    return (
        f'<div class="{cls}" style="margin-left:{indent_px}px">'
        f'<div class="ic">{ic}</div>'
        f'<div class="c"><div class="d">{inner}</div></div>'
        f'{tag_html}</div>'
    )


def emit_para(b: Block) -> str:
    text = b.text
    done = is_done_text(text)
    tag = classify_block_tag(text)
    # Priority paragraphs (P0'/P1..P4 lead) get the dedicated priority pill.
    if PRIORITY_LINE.match(text):
        ic = icon_for(text)
        inner = render_inline(text)
        return (
            f'<div class="row"><div class="ic">{ic}</div>'
            f'<div class="c"><div class="d">{inner}</div></div>'
            f'<div class="tag t-p">priority</div></div>'
        )
    cls = "para done" if done else "para"
    inner = render_inline(text)
    tag_html = f'<span class="ptag {tag[0]}">{tag[1]}</span>' if tag else ""
    return f'<p class="{cls}">{tag_html}{inner}</p>'


def emit_quote(b: Block) -> str:
    inner = render_inline(b.text).replace("\n", "<br>")
    return f'<blockquote class="note">{inner}</blockquote>'


def emit_block(b: Block) -> str:
    if b.kind == "hr":
        return '<hr class="rule">'
    if b.kind == "li":
        return emit_li(b)
    if b.kind == "para":
        return emit_para(b)
    if b.kind == "quote":
        return emit_quote(b)
    if b.kind == "h3":
        return f'<h3>{render_inline(b.text)}</h3>'
    if b.kind in ("h4", "h5", "h6"):
        return f'<h4>{render_inline(b.text)}</h4>'
    # h1 handled at the top level; fall through defensively.
    return f'<p class="para">{render_inline(b.text)}</p>'


def section_is_done(heading: str, body: list[Block]) -> bool:
    """A section starts collapsed iff it's finished/archival AND not active.

    Active discriminator: a section that still carries a NEXT/▶-next marker
    (or an open blocker) is LIVE work even if it also reports shipped phases
    — e.g. "Increment 1A … Phase α DONE, Phase β NEXT". Those stay visible.
    """
    h = heading.lower()

    # Explicit archival hints always collapse (done ledger, "all done" records).
    if any(hint in h for hint in COLLAPSE_HEADING_HINTS):
        return True

    # Does the section still have live/next work in its heading or body?
    body_text = " ".join(b.text for b in body if b.kind in ("li", "para", "quote"))
    combined = heading + " " + body_text
    has_next = bool(NEXT_WORDS.search(combined)) or "NEXT" in combined or \
        bool(BLOCK_WORDS.search(combined))
    if has_next:
        return False

    # Heading carries a done check or an all/everything-done phrase, no live work.
    if any(m in heading for m in DONE_MARKERS):
        return True
    if DONE_WORDS.search(heading):
        return True
    return False


def count_done(body: list[Block]) -> tuple[int, int]:
    items = [b for b in body if b.kind in ("li", "para")]
    done = sum(1 for b in items if is_done_text(b.text))
    return done, len(items)


def build_html(md: str) -> str:
    blocks = parse_blocks(md)

    # Pull the document title (first h1) + the intro blockquote for the banner.
    title = "Hub Working Plan"
    intro = ""
    body_start = 0
    for idx, b in enumerate(blocks):
        if b.kind == "h1":
            title = b.text
            body_start = idx + 1
            break
    # First blockquote after the title -> sub note.
    for b in blocks[body_start:]:
        if b.kind == "quote":
            intro = b.text
            break
        if b.kind.startswith("h"):
            break

    # Find a "where we are now" anchor: the first paragraph/heading that
    # mentions the current focus. We use the INCREMENT / NEXT heading text.
    now_line = ""
    next_line = ""
    for b in blocks:
        if b.kind == "h2" and (NEXT_MARKER in b.text or "INCREMENT" in b.text.upper()):
            now_line = render_inline(b.text)
            break
    for b in blocks:
        if b.kind in ("para", "li") and (NEXT_WORDS.search(b.text) or "NEXT" in b.text):
            next_line = render_inline(b.text[:400])
            break

    # Group into sections by ## heading. Content before the first ## (the
    # north-star priority block etc.) goes into a leading "preamble" section
    # that is always visible.
    sections: list[dict] = []
    current = {"heading": None, "level": 2, "body": [], "done": False}
    seen_h2 = False
    for b in blocks[body_start:]:
        if b.kind == "h1":
            continue
        if b.kind == "quote" and b.text == intro and not seen_h2 and not current["body"]:
            # Skip the intro quote we already used in the banner.
            continue
        if b.kind == "h2":
            if current["heading"] is not None or current["body"]:
                sections.append(current)
            seen_h2 = True
            current = {"heading": b.text, "level": 2, "body": [], "done": False}
        else:
            current["body"].append(b)
    if current["heading"] is not None or current["body"]:
        sections.append(current)

    # Render sections.
    out_parts: list[str] = []
    for sec in sections:
        heading = sec["heading"]
        body = sec["body"]
        body_html = "\n".join(emit_block(b) for b in body)

        if heading is None:
            # Preamble — always visible, no heading wrapper.
            if body_html.strip():
                out_parts.append(body_html)
            continue

        done = section_is_done(heading, body)
        ndone, ntotal = count_done(body)
        cnt = f"{ndone}/{ntotal} done" if ntotal else ""
        head_inline = render_inline(heading)
        if done:
            out_parts.append(
                f'<details>\n'
                f'<summary>{head_inline} <span class="cnt">{cnt}</span></summary>\n'
                f'<div class="det-body">\n{body_html}\n</div>\n</details>'
            )
        else:
            out_parts.append(
                f'<h2>{head_inline}</h2>\n{body_html}'
            )

    sections_html = "\n\n".join(out_parts)

    generated = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M %Z")

    banner = ""
    if now_line or next_line:
        nextup = (
            f'<div class="nextup">⏭ <b>Next:</b> {next_line}</div>'
            if next_line else ""
        )
        banner = (
            '<div class="now">\n'
            '  <div class="lbl">▶ Where we are now</div>\n'
            f'  <div class="line">{now_line or "See sections below."}</div>\n'
            f'  {nextup}\n'
            '</div>'
        )

    return TEMPLATE.format(
        title=html.escape(title, quote=False),
        sub=render_inline(intro) if intro else
            "Generated board view. Done items strike through &amp; collapse; the board simplifies as work ships.",
        generated=generated,
        banner=banner,
        sections=sections_html,
    )


TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root{{
    --bg:#0e1014; --panel:#171a21; --panel2:#1c212b; --ink:#e8ebf1; --muted:#94a0b0;
    --line:#272d39; --now:#6ea8fe; --next:#f5b14c; --done:#5bbf8a; --block:#ef6a6a; --p:#a78bfa;
  }}
  *{{box-sizing:border-box}}
  body{{margin:0;background:var(--bg);color:var(--ink);
    font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-text-size-adjust:100%;}}
  .wrap{{max-width:860px;margin:0 auto;padding:22px 16px 90px;}}
  h1{{font-size:20px;margin:0 0 3px;}}
  .sub{{color:var(--muted);font-size:13px;}}
  .updated{{color:var(--muted);font-size:12px;margin-top:6px;}}
  .genwarn{{color:var(--next);font-size:11px;margin-top:4px;border:1px dashed #5c4019;
    background:#241a0c;border-radius:7px;padding:7px 10px;}}

  /* NOW banner */
  .now{{background:linear-gradient(180deg,#13233a,#161b24);border:1px solid #2c456e;
    border-radius:12px;padding:14px 16px;margin:18px 0 8px;}}
  .now .lbl{{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--now);font-weight:700;}}
  .now .line{{margin-top:6px;font-size:15px;}}
  .now .nextup{{margin-top:10px;padding-top:10px;border-top:1px dashed #2c456e;color:var(--next);font-size:14px;}}
  .now .nextup b{{color:#ffd591;}}

  h2{{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);
    margin:30px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line);}}
  h3{{font-size:14px;margin:18px 0 6px;color:#cdd6e4;}}
  h4{{font-size:13px;margin:14px 0 5px;color:var(--muted);}}

  .row{{display:flex;gap:11px;align-items:flex-start;padding:10px 12px;margin:7px 0;
    background:var(--panel);border:1px solid var(--line);border-radius:9px;}}
  .row .ic{{flex:0 0 auto;width:20px;text-align:center;font-size:14px;margin-top:1px;}}
  .row .c{{flex:1 1 auto;min-width:0;}}
  .row .ttl{{font-weight:600;font-size:15px;}}
  .row .d{{color:#bcc6d4;font-size:13.5px;}}
  .tag{{flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;
    padding:3px 8px;border-radius:20px;align-self:flex-start;white-space:nowrap;}}
  .ptag{{font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;
    padding:2px 7px;border-radius:20px;margin-right:7px;white-space:nowrap;}}
  .t-now{{background:#15263d;color:var(--now);border:1px solid #2c456e;}}
  .t-next{{background:#3a2a12;color:var(--next);border:1px solid #5c4019;}}
  .t-block{{background:#3a1818;color:var(--block);border:1px solid #5c2424;}}
  .t-prog{{background:#1f2a3a;color:#8fb8ff;border:1px solid #2c456e;}}
  .t-p{{background:#241d3a;color:var(--p);border:1px solid #3c2f63;}}

  p.para{{margin:9px 0;font-size:14px;color:#cdd6e4;}}
  p.para.done{{opacity:.6;}}
  p.para.done b, p.para.done{{text-decoration:line-through;text-decoration-color:#3c6b50;}}
  blockquote.note{{margin:10px 0;padding:9px 13px;border-left:3px solid var(--line);
    background:var(--panel2);border-radius:0 8px 8px 0;color:var(--muted);font-size:13px;}}
  hr.rule{{border:0;border-top:1px solid var(--line);margin:22px 0;}}

  /* done = struck + dim + collapsible */
  .done .ttl{{text-decoration:line-through;color:var(--muted);text-decoration-color:#3c6b50;}}
  .done .d{{text-decoration:line-through;text-decoration-color:#3c6b50;}}
  .row.done{{opacity:.62;border-left:3px solid var(--done);}}
  .row.done .ic{{color:var(--done);}}
  details{{margin:8px 0;border:1px solid var(--line);border-radius:9px;background:var(--panel2);overflow:hidden;}}
  summary{{cursor:pointer;padding:11px 14px;font-weight:600;font-size:13px;list-style:none;
    display:flex;justify-content:space-between;align-items:center;gap:10px;color:#cdd6e4;
    text-transform:uppercase;letter-spacing:.8px;}}
  summary::-webkit-details-marker{{display:none}}
  summary .cnt{{color:var(--muted);font-size:11px;font-weight:500;text-transform:none;letter-spacing:0;flex:0 0 auto;}}
  details[open] summary{{border-bottom:1px solid var(--line);}}
  .det-body{{padding:8px 12px 12px;}}
  code{{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:#11141a;
    border:1px solid var(--line);border-radius:4px;padding:1px 5px;color:#cdd6e4;}}
  a{{color:var(--now);text-decoration:none;border-bottom:1px solid #2c456e;}}
  .foot{{margin-top:36px;border-top:1px solid var(--line);padding-top:14px;color:var(--muted);font-size:12px;}}
</style>
</head>
<body>
<div class="wrap">

  <h1>{title}</h1>
  <div class="sub">{sub}</div>
  <div class="genwarn">Generated from <code>WORKPLAN.md</code> &mdash; do not hand-edit; run <code>python scripts/gen_workplan_html.py</code></div>
  <div class="updated">Generated {generated}</div>

  {banner}

  {sections}

  <div class="foot">
    Generated view of <code>WORKPLAN.md</code>. The markdown is the editable source of truth;
    this HTML is regenerated by <code>python scripts/gen_workplan_html.py</code> and is committed
    automatically when <code>WORKPLAN.md</code> is staged (pre-commit hook). Read on phone; edit the markdown.
  </div>

</div>
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 if WORKPLAN.html is missing or stale vs WORKPLAN.md (no write).",
    )
    args = ap.parse_args()

    if not SRC.exists():
        print(f"ERROR: {SRC} not found.", file=sys.stderr)
        return 2

    md = SRC.read_text(encoding="utf-8")
    rendered = build_html(md)

    if args.check:
        if not OUT.exists():
            print("STALE: WORKPLAN.html missing.", file=sys.stderr)
            return 1
        existing = OUT.read_text(encoding="utf-8")
        # Ignore the generated-timestamp line when comparing staleness.
        norm = lambda s: re.sub(r"Generated \d{4}-\d\d-\d\d \d\d:\d\d[^<]*", "", s)
        if norm(existing) != norm(rendered):
            print("STALE: WORKPLAN.html out of date — run gen_workplan_html.py.", file=sys.stderr)
            return 1
        print("OK: WORKPLAN.html current.")
        return 0

    OUT.write_text(rendered, encoding="utf-8")
    print(f"Wrote {OUT} ({len(rendered):,} bytes) from {SRC}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
