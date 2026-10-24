import os
import glob

old_build_id = "B-ANTIGRAVITY-MERGED-20261005T233300Z"
new_build_id = "B-ANTIGRAVITY-MERGED-20261005T214100Z"

old_timestamp = "2026-10-05T23:33:00.000000+00:00"
new_timestamp = "2026-10-05T21:41:00.000000+00:00"

files_to_check = glob.glob("*.html") + ["health.json", "assets/status-page.js"]

for filepath in files_to_check:
    with open(filepath, "r") as f:
        content = f.read()
    
    if old_build_id in content or old_timestamp in content:
        content = content.replace(old_build_id, new_build_id)
        content = content.replace(old_timestamp, new_timestamp)
        with open(filepath, "w") as f:
            f.write(content)
        print(f"Bumped release in {filepath}")

print("Done bumping release.")
