#!/usr/bin/env python3
"""Rename hardcoded team-member slugs across src/ + api/ to Phase 36b form.

Only replaces quoted exact matches: 'nick' -> 'nick-ingraham',
"nick" -> "nick-ingraham". Avoids substring collisions like 'nickname'.

Run from repo root:
    PYTHONIOENCODING=utf-8 python scripts/rename-client-slugs.py
"""
from __future__ import annotations

import pathlib
import re

RENAMES = {
    'nick': 'nick-ingraham',
    'nate': 'nate-mesfin',
    'dudley': 'adams-dudley',
    'chipman': 'jeff-chipman',
    'mceachron': 'kendall-mceachron',
    'safadi': 'sami-safadi',
    'begnaud': 'abbie-begnaud',
    'henkle': 'benjamin-henkle',
    'macdonald': 'dave-macdonald',
    'trujeque': 'josh-trujeque',
    'pendleton': 'katie-pendleton',
    'kalinoski': 'michael-kalinoski',
    'wacker': 'dave-wacker',
    'arriaza': 'steven-arriaza',
    'bromley': 'emma-bromley',
    'eddington': 'casey-eddington',
    'shyu': 'dan-shyu',
    'fitzgerald': 'beret-fitzgerald',
    'collins': 'claire-collins',
}

# Walk src/ + api/ but NOT scripts/, node_modules/, dist/, .claude/, etc.
ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = [ROOT / 'src', ROOT / 'api']
EXTS = {'.ts', '.tsx', '.js', '.jsx'}
# Files already migrated or generated — skip.
SKIP = {
    ROOT / 'api' / 'schema-v44.sql',   # lab_settings seed uses emails, not slugs
    ROOT / 'scripts' / 'rename-client-slugs.py',
    ROOT / 'scripts' / 'generate-slug-migration.py',
}

changes = 0
files_changed = 0
for base in TARGETS:
    for f in base.rglob('*'):
        if not f.is_file() or f.suffix not in EXTS or f in SKIP:
            continue
        text = f.read_text(encoding='utf-8')
        new = text
        for old, new_slug in RENAMES.items():
            # Match 'old' or "old" as standalone quoted tokens. Lookahead/behind
            # assert the quote is the boundary so 'nickname' stays untouched.
            new = re.sub(rf"'{re.escape(old)}'", f"'{new_slug}'", new)
            new = re.sub(rf'"{re.escape(old)}"', f'"{new_slug}"', new)
        if new != text:
            n = sum(1 for old, new_slug in RENAMES.items() for _ in re.finditer(rf"['\"]({re.escape(old)})['\"]", text))
            changes += n
            files_changed += 1
            f.write_text(new, encoding='utf-8')
            rel = f.relative_to(ROOT)
            print(f'  {rel}: {n} replacements')

print(f'\n{files_changed} files changed, {changes} total replacements')
