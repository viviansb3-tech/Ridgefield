import glob
import re

for f in glob.glob('*.html'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # find <div class="hero-media"> ... </div>
    def replacer(m):
        block = m.group(0)
        # Find the first <img> in block
        def img_replacer(img_m):
            img_tag = img_m.group(0)
            if 'fetchpriority="high"' not in img_tag:
                img_tag = img_tag.replace('<img ', '<img fetchpriority="high" ')
            img_tag = img_tag.replace('loading="lazy"', '')
            return img_tag
        return re.sub(r'<img[^>]+>', img_replacer, block, count=1)
        
    new_content = re.sub(r'<div class="hero-media">.*?</div>', replacer, content, flags=re.DOTALL)
    
    # Some pages might use a different hero class, like rf-hero
    def replacer2(m):
        block = m.group(0)
        def img_replacer(img_m):
            img_tag = img_m.group(0)
            if 'fetchpriority="high"' not in img_tag:
                img_tag = img_tag.replace('<img ', '<img fetchpriority="high" ')
            img_tag = img_tag.replace('loading="lazy"', '')
            return img_tag
        return re.sub(r'<img[^>]+>', img_replacer, block, count=1)
    
    new_content = re.sub(r'<div class="rf-hero[^"]*".*?</div>', replacer2, new_content, flags=re.DOTALL)

    with open(f, 'w', encoding='utf-8') as file:
        file.write(new_content)
print("done")
