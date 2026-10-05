import glob
import re

html_files = glob.glob('*.html')
for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Let's find images
    imgs = re.findall(r'<img[^>]+>', content)
    for img in imgs:
        if 'width=' not in img or 'height=' not in img:
            print(f"{f}: Image missing width/height: {img}")
        
    # Check if there is a hero image
    heroes = re.findall(r'<img[^>]+(?:hero|rf-hero)[^>]*>', content)
    # wait, sometimes hero is just the first image in the main content or header.
    # Let's just find the first image and see if it has fetchpriority="high".
    if imgs:
        first_img = imgs[0]
        if 'fetchpriority="high"' not in first_img and 'loading="lazy"' in first_img:
            print(f"{f}: First image has lazy loading instead of fetchpriority=high: {first_img}")
        if 'fetchpriority="high"' not in first_img and 'hero' in first_img.lower():
            print(f"{f}: Hero image might be missing fetchpriority=high: {first_img}")
