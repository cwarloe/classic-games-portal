#!/usr/bin/env python3
import json, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
games_dir = ROOT / "games"
manifest = []

for folder in sorted(games_dir.iterdir()):
    if not folder.is_dir():
        continue
    # Prefer index.html else first .html
    entry = None
    if (folder / "index.html").exists():
        entry = f"games/{folder.name}/index.html"
    else:
        htmls = sorted(folder.glob("*.html"))
        if htmls:
            entry = f"games/{folder.name}/{htmls[0].name}"
        else:
            continue
    # Read optional metadata
    meta_path = folder / "game.json"
    meta = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    manifest.append({
        "id": folder.name,
        "title": meta.get("title", folder.name.replace('-', ' ').title()),
        "entry": entry,
        "system": meta.get("system", ""),
        "year": meta.get("year", ""),
        "tags": meta.get("tags", []),
        "author": meta.get("author", "")
    })

out = ROOT / "manifest.json"
out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Wrote {out} with {len(manifest)} entries.")
