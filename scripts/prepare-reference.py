"""One-time preparation of the public reference markup, tokens and visual assets.

The running site is independent of Python and of the reference origin.
Re-running this importer overwrites the prepared HTML and data; app.js/styles.css
are the maintained, independent interaction and responsive implementation.
"""
from pathlib import Path
from bs4 import BeautifulSoup, Comment
from urllib.request import urlopen, Request
from urllib.parse import urlparse, parse_qs, urljoin
from concurrent.futures import ThreadPoolExecutor
import json, re, hashlib, json5

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
BASE = 'https://rbp-cloudlight-template.vercel.app'
SOURCE = Path('/tmp/cloudlight-reference.html').read_text()
BUNDLE = Path('/tmp/cloudlight-inspect/44gwqxf8kbuut.js').read_text()
soup = BeautifulSoup(SOURCE, 'html.parser')

def array_after(text, prefix):
    start = text.index(prefix) + len(prefix)
    depth, quote, escaped = 0, None, False
    for i in range(start, len(text)):
        c = text[i]
        if quote:
            if escaped: escaped = False
            elif c == '\\': escaped = True
            elif c == quote: quote = None
        elif c in ['"', "'"]: quote = c
        elif c == '[': depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                return json5.loads(text[start:i+1].replace('!0', 'true').replace('!1', 'false'))
    raise ValueError(prefix)

teams = array_after(BUNDLE[BUNDLE.index('24496,e=>'):], 'let f=')
stories = array_after(BUNDLE[BUNDLE.index('10719,e=>'):], ',m=')
faq = array_after(BUNDLE[BUNDLE.index('81572,e=>'):], 'let s=')

assets = {}
def asset(url):
    url = urljoin(BASE, url)
    if '/_next/image?' in url:
        url = parse_qs(urlparse(url).query)['url'][0]
    if url in assets: return assets[url]
    p = urlparse(url)
    ext = Path(p.path).suffix or '.jpg'
    name = Path(p.path).stem
    if p.netloc == 'images.unsplash.com': name += '-' + hashlib.sha1(url.encode()).hexdigest()[:7]
    dest = 'assets/' + name + ext
    assets[url] = dest
    return dest

for script in soup.find_all('script'): script.decompose()
for c in soup.find_all(string=lambda t: isinstance(t, Comment)): c.extract()
for tag in soup.select('template, next-route-announcer'): tag.decompose()
for tag in list(soup.body.find_all('div', recursive=False)):
    if tag.has_attr('hidden'): tag.decompose()
soup.html.attrs.pop('data-dpl-id', None)
for link in soup.find_all('link'):
    rel = link.get('rel', [])
    if any(r in rel for r in ['stylesheet', 'preload', 'manifest', 'author', 'apple-touch-icon']): link.decompose()
    elif 'icon' in rel:
        if '.svg' in link.get('href',''): link['href'] = asset('/icon.svg')
        else: link.decompose()
    elif 'canonical' in rel: link['href'] = 'https://cloudlight-reconstructed-igor.igormraesmm.chatgpt.site'
for meta in soup.find_all('meta'):
    if 'cloudlight.example.com' in meta.get('content',''):
        if 'image' in meta.get('property', meta.get('name','')): meta.decompose()
        else: meta['content'] = 'https://cloudlight-reconstructed-igor.igormraesmm.chatgpt.site'
for img in soup.find_all('img'):
    img['src'] = asset(img['src'])
    for attr in ['srcset', 'data-nimg', 'fetchpriority']: img.attrs.pop(attr, None)
    img['decoding'] = 'async'

for story in stories:
    story['image'] = asset('https://images.unsplash.com/photo-' + story['photo'] + '?w=900&h=1125&q=75&auto=format&fit=crop&crop=faces')

css = Path('/tmp/cloudlight-inspect/0zfrfa8pvzmmd.css').read_text()
def font_replace(m):
    path = asset('/_next/static/immutable/' + m.group(1).replace('../', ''))
    return 'url(' + path + ')'
css = re.sub(r'url\((\.\./media/[^)]+)\)', font_replace, css)
css = css.replace('url(/grain.svg)', 'url(assets/grain.svg)')
asset('/grain.svg')
(OUT/'reference.css').write_text(css)
for filename, module in [('cloud.frag','16679'), ('wave.frag','37634')]:
    text = Path('/tmp/cloudlight-inspect/modules/44gwqxf8kbuut.js-'+module+'.txt').read_text()
    shader = re.search(r'let n=`(.*?)`;', text, re.S).group(1)
    (OUT/'assets'/filename).write_text(shader)

# Mark the semantic parts once, so runtime interaction code does not depend on
# generated class-name strings or the original rendering framework.
hero = soup.find(id='hero')
hero.find('div', recursive=False)['data-shader'] = 'cloud'
hero.find('header')['id'] = 'site-header'
hero.find('button', attrs={'aria-label':'Open menu'})['data-menu-toggle'] = ''
for link in hero.select('a[aria-expanded]'): link['data-dropdown'] = link.get_text(strip=True).lower()
for h in soup.select('h1, #final-cta-heading'):
    br = h.find('br')
    if br: br.insert_after(' ')

for section in soup.find_all('section'):
    for idx, element in enumerate(section.select('[style*="opacity:0"][style*="translateY"]')):
        element['data-reveal'] = ''
        element['data-delay'] = str(min(idx % 5 * 0.06, .24))
        element['data-y'] = '24' if '24px' in element['style'] else '16'
        del element['style']

grid = soup.find('ul', attrs={'aria-label':'Supported file formats'})
grid['id'] = 'format-grid'
grid.parent['id'] = 'format-stage'
for el in grid.select('li'):
    el['data-format-card'] = ''
    el.attrs.pop('style', None)

manifesto = soup.find(id='manifesto-heading').find_next_sibling('p')
manifesto['id'] = 'manifesto-text'
for word in manifesto.select('span[style*="opacity"]'):
    word['data-word'] = ''

bench = soup.find(id='benchmarks')
for idx, row in enumerate(bench.select('[role="tabpanel"] > li')):
    row['data-benchmark-row'] = str(idx)
    row.find('span', style=True)['data-bar'] = ''
    row.find_all('span', recursive=False)[-1]['data-value'] = ''

team = soup.find(id='teams')
team.select_one('[role="tabpanel"] > ul')['id'] = 'team-points'
preview = team.select_one('div[aria-hidden="true"]')
preview['id'] = 'team-preview'

story_section = soup.find(id='stories')
story_section.select_one('img[alt^="Portrait"]')['id'] = 'story-photo'
story_section.find('figure')['id'] = 'story-quote'
story_section.select_one('[role="tablist"]')['id'] = 'story-tabs'

pricing = soup.find(id='pricing')
for li in pricing.select('ul.mt-12 > li'):
    title = li.find('h3').get_text(strip=True)
    li['data-plan'] = title.lower()
    price = li.select_one('span.tabular-nums')
    price['data-price'] = ''
    if title != 'Free':
        next(p for p in li.find_all('p') if 'Billed yearly' in p.get_text())['data-billing-caption'] = ''
    if title == 'Pro':
        next(d for d in li.find_all('div') if 'absolute' in d.get('class',[]) and 'inset-0' in d.get('class',[]))['data-shader'] = 'wave'
for i, li in enumerate(soup.select('#help ul > li')):
    li['data-faq'] = str(i)
    panel = li.find('div', attrs={'role':'region'})
    if not panel:
        panel = soup.new_tag('div', attrs={'role':'region','id':li.button['aria-controls'],'aria-labelledby':li.button['id'],'hidden':''})
        p = soup.new_tag('p', attrs={'class':'pb-6 text-[15px] leading-7 text-muted-foreground'})
        p.string = faq[i]['a']; panel.append(p); li.append(panel)
    panel['class'] = ['faq-answer','overflow-hidden']
    panel.attrs.pop('style', None)

cta = soup.find(id='try-free')
cta.select_one('div.absolute')['data-shader'] = 'wave'
theme = soup.find('button', attrs={'aria-label':'Toggle theme'})
theme['id'] = 'theme-toggle'; theme.attrs.pop('disabled', None)
theme['class'] = ['theme-toggle']
theme['aria-label'] = 'Switch to dark theme'
theme['aria-pressed'] = 'false'

for group in soup.select('[role="tablist"], [role="radiogroup"]'):
    if group.get('id') == 'story-tabs': continue
    group['data-pill-tabs'] = ''
    for b in group.find_all('button', recursive=False):
        thumb = b.find('span', class_=lambda c:c and 'absolute' in c)
        if thumb: thumb.decompose()

# Keep the original demonstration links explicit instead of sending visitors to
# reserved example domains or pretending there is a real transfer backend.
for a in soup.find_all('a',href=True):
    if 'cloudlight.example.com' in a['href'] or a['href'] in ['https://x.com/cloudlight','https://linkedin.com/company/cloudlight','https://github.com/cloudlight']:
        a['data-demo-link'] = a['href']
        a['href'] = '#demo'

head_script=soup.new_tag('script')
head_script.string="try{document.documentElement.classList.toggle('dark',(localStorage.getItem('cloudlight-theme')||'light')==='dark')}catch{}"
soup.head.append(head_script)
for href in ['reference.css','styles.css']:
    soup.head.append(soup.new_tag('link',attrs={'rel':'stylesheet','href':href}))
script = soup.new_tag('script',attrs={'type':'module','src':'app.js'});soup.body.append(script)
noscript = soup.new_tag('noscript')
noscript.append(BeautifulSoup('<style>[data-reveal]{opacity:1!important;transform:none!important}[data-word]{opacity:1!important}</style>','html.parser'))
soup.body.append(noscript)
for section in soup.find_all('section'):
    section.insert_before(Comment(' '+(section.get('id') or section.get('aria-labelledby','Section'))+' '))
(OUT/'index.html').write_text(str(soup))
(OUT/'data.js').write_text('export const teams = '+json.dumps(teams,ensure_ascii=False,indent=2)+';\nexport const stories = '+json.dumps(stories,ensure_ascii=False,indent=2)+';\n')

def download(item):
    url, dest = item
    path = OUT/dest
    if path.exists() and path.stat().st_size: return
    req = Request(url,headers={'User-Agent':'Mozilla/5.0'})
    for attempt in range(3):
        try:
            data = urlopen(req,timeout=35).read()
            path.write_bytes(data)
            return
        except Exception:
            if attempt == 2: raise
with ThreadPoolExecutor(max_workers=8) as pool: list(pool.map(download,assets.items()))
(ROOT/'asset-sources.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2))
print(f'Prepared {len(assets)} local assets, {len(soup.select("[data-reveal]"))} reveal elements and 14 sections.')
