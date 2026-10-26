#!/usr/bin/env python3
"""
Build script for static production hosting (Cloudflare Pages, Netlify, etc.)
Copies exactly the vetted public files declared in deploy-manifest.json into `dist/`.
"""
import json
import os
import shutil
import sys

def build():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    manifest_path = os.path.join(root, "deploy-manifest.json")
    dist_dir = os.path.join(root, "dist")

    if not os.path.exists(manifest_path):
        print(f"Error: {manifest_path} not found", file=sys.stderr)
        sys.exit(1)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    files = manifest.get("files", [])
    print(f"Preparing production distribution with {len(files)} files...")

    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir)
    os.makedirs(dist_dir, exist_ok=True)

    copied = 0
    for rel_path in files:
        src = os.path.join(root, rel_path)
        dest = os.path.join(dist_dir, rel_path)
        if not os.path.exists(src):
            print(f"Error: Missing manifest file: {rel_path}", file=sys.stderr)
            sys.exit(1)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(src, dest)
        copied += 1

    print(f"Build complete: {copied} files copied to dist/")

if __name__ == "__main__":
    build()
