import glob, re

for f in glob.glob('*.html'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # get title
    title_m = re.search(r'<title>([^<]+)</title>', content)
    title = title_m.group(1).split('|')[0].strip() if title_m else "Ridgefield Academy"
    
    # get meta description
    desc_m = re.search(r'<meta name="description" content="([^"]+)">', content)
    desc = desc_m.group(1) if desc_m else "Ridgefield Academy information page."
    
    url = f"https://www.ridgefieldacademy.co.za/{f}" if f != 'index.html' else "https://www.ridgefieldacademy.co.za/"
    
    # If missing, inject
    if '<link rel="canonical"' not in content:
        canonical = f'<link rel="canonical" href="{url}">'
        content = content.replace('</head>', f'{canonical}\n</head>')
        
    if 'property="og:title"' not in content:
        og = f'''<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="https://www.ridgefieldacademy.co.za/assets/2026.png">
<meta property="og:type" content="website">'''
        content = content.replace('</head>', f'{og}\n</head>')

    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("done")
