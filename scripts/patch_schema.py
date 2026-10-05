import json

schema_org = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "Ridgefield Academy",
  "url": "https://www.ridgefieldacademy.co.za/",
  "logo": "https://www.ridgefieldacademy.co.za/assets/2026.png",
  "sameAs": [],
  "address": [
    {
      "@type": "PostalAddress",
      "streetAddress": "22 Maartens Street",
      "addressLocality": "Bloemfontein",
      "addressRegion": "Free State",
      "addressCountry": "ZA"
    },
    {
      "@type": "PostalAddress",
      "streetAddress": "25 Wilcock Road",
      "addressLocality": "Noordhoek, Bloemfontein",
      "addressRegion": "Free State",
      "addressCountry": "ZA"
    }
  ]
}

schema_cambridge = {
  "@context": "https://schema.org",
  "@type": "EducationalOccupationalProgram",
  "name": "Cambridge International Pathway",
  "provider": {
    "@type": "EducationalOrganization",
    "name": "Ridgefield Academy",
    "url": "https://www.ridgefieldacademy.co.za/"
  }
}

schema_caps = {
  "@context": "https://schema.org",
  "@type": "EducationalOccupationalProgram",
  "name": "CAPS Secondary Pathway",
  "provider": {
    "@type": "EducationalOrganization",
    "name": "Ridgefield Academy",
    "url": "https://www.ridgefieldacademy.co.za/"
  }
}

import glob, re

def add_schema(file_path, schema_obj):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    if 'type="application/ld+json"' in content:
        return
    schema_str = '<script type="application/ld+json">\n' + json.dumps(schema_obj, indent=2) + '\n</script>\n</head>'
    content = content.replace('</head>', schema_str)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

add_schema('index.html', schema_org)
add_schema('campus.html', schema_org)
add_schema('cambridge.html', schema_cambridge)
add_schema('caps-secondary.html', schema_caps)

def get_title(content):
    m = re.search(r'<title>([^<]+)</title>', content)
    return m.group(1).split('|')[0].strip() if m else "Ridgefield Academy"

def add_breadcrumb(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'type="application/ld+json"' in content:
        return
    if file_path == 'index.html':
        return
        
    title = get_title(content)
    schema_bc = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [{
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://www.ridgefieldacademy.co.za/"
      },{
        "@type": "ListItem",
        "position": 2,
        "name": title,
        "item": f"https://www.ridgefieldacademy.co.za/{file_path}"
      }]
    }
    schema_str = '<script type="application/ld+json">\n' + json.dumps(schema_bc, indent=2) + '\n</script>\n</head>'
    content = content.replace('</head>', schema_str)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

for f in glob.glob('*.html'):
    add_breadcrumb(f)

print("Schema added")
