import glob, re, json
from datetime import datetime

new_build_id = "B-ANTIGRAVITY-MERGED-20261005T233300Z"
new_generated_at = "2026-10-05T23:33:00.000000+00:00"
old_build_id = "B-ANTIGRAVITY-MERGED-20260928T000000Z"

# 1. HTML files
for f in glob.glob('*.html'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    content = content.replace(old_build_id, new_build_id)
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

# 2. health.json
with open('health.json', 'r', encoding='utf-8') as file:
    health = json.load(file)
health['buildId'] = new_build_id
health['generatedAt'] = new_generated_at
with open('health.json', 'w', encoding='utf-8') as file:
    json.dump(health, file, indent=2)

# 3. assets/status-page.js
with open('assets/status-page.js', 'r', encoding='utf-8') as file:
    js = file.read()
js = js.replace(old_build_id, new_build_id)
js = re.sub(r'2026-09-28T00:00:00\.000000\+00:00', new_generated_at, js)
with open('assets/status-page.js', 'w', encoding='utf-8') as file:
    file.write(js)

print("Release metadata updated")
