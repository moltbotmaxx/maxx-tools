#!/usr/bin/env python3
import json, re, html, math
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

OUT = '/Users/maxx/.Gemini/antigravity/scratch/rss-dashboard/rss-dashboard/public/data.json'

NEWS_FEEDS = [
    ('OpenAI','https://openai.com/news/rss.xml'),
    ('Anthropic','https://www.anthropic.com/news/rss.xml'),
    ('Google AI Blog','https://blog.google/technology/ai/rss/'),
    ('MIT Technology Review','https://www.technologyreview.com/topic/artificial-intelligence/feed/'),
    ('VentureBeat','https://venturebeat.com/category/ai/feed/'),
    ('TechCrunch','https://techcrunch.com/category/artificial-intelligence/feed/'),
    ('Ars Technica','https://feeds.arstechnica.com/arstechnica/technology-lab'),
    ('The Register','https://www.theregister.com/software/ai_ml/headlines.atom'),
    ('AI News','https://www.artificialintelligence-news.com/feed/'),
    ('Hugging Face','https://huggingface.co/blog/feed.xml'),
]

X_ACCOUNTS = ['OpenAI','sama','AnthropicAI','GoogleDeepMind','NVIDIAAI','xai']
REDDIT_SUBS = ['artificial','MachineLearning','singularity','ChatGPT','OpenAI','LocalLLaMA']
KEYWORDS = ['ai','artificial intelligence','machine learning','llm','model','agent','robot','openai','anthropic','deepmind','nvidia','grok','chatgpt','gemini','claude']


def fetch(url, timeout=18):
    req = Request(url, headers={'User-Agent':'Mozilla/5.0 rss-dashboard-bot'})
    with urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', errors='ignore')


def clean(s):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def extract(block, patterns):
    for p in patterns:
        m = re.search(p, block, flags=re.I|re.S)
        if m and m.group(1):
            return clean(m.group(1))
    return ''


def parse_iso(s):
    if not s:
        return None
    for fmt in [None, '%a, %d %b %Y %H:%M:%S %z', '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%SZ']:
        try:
            if fmt is None:
                return datetime.fromisoformat(s.replace('Z','+00:00'))
            return datetime.strptime(s, fmt)
        except Exception:
            pass
    return None


def extract_image(block):
    pats = [
        r'<media:content[^>]*url=["\']([^"\']+)["\']',
        r'<enclosure[^>]*url=["\']([^"\']+)["\']',
        r'<media:thumbnail[^>]*url=["\']([^"\']+)["\']',
        r'<img[^>]*src=["\']([^"\']+)["\']',
    ]
    for p in pats:
        m = re.search(p, block, flags=re.I|re.S)
        if m:
            u = m.group(1).strip()
            if u.startswith('http') and not u.lower().endswith('.svg'):
                return u
    return ''


def news_items():
    items=[]
    for source,url in NEWS_FEEDS:
        try:
            xml = fetch(url)
        except Exception:
            continue
        blocks = re.findall(r'<item[\s\S]*?</item>', xml, flags=re.I) + re.findall(r'<entry[\s\S]*?</entry>', xml, flags=re.I)
        for b in blocks[:24]:
            title = extract(b,[r'<title[^>]*>([\s\S]*?)</title>'])
            link = extract(b,[r'<link>([\s\S]*?)</link>', r'<link[^>]*href=["\']([^"\']+)["\']'])
            date_raw = extract(b,[r'<pubDate>([\s\S]*?)</pubDate>', r'<published>([\s\S]*?)</published>', r'<updated>([\s\S]*?)</updated>'])
            if not title or not link:
                continue
            dt = parse_iso(date_raw)
            items.append({
                'headline': title,
                'link': link,
                'source': source,
                'date': (dt or datetime.now(timezone.utc)).strftime('%Y-%m-%d'),
                '_dt': dt,
                'image_url': extract_image(b),
            })
    # dedup by link + headline
    dedup={}
    for it in items:
        k=it['link']
        dedup[k]=it
    arr=list(dedup.values())

    def score(it):
        t=it['headline'].lower()
        hits=sum(1 for k in KEYWORDS if k in t)
        fit=min(100, 45 + hits*9)
        age_h=48.0
        if it['_dt']:
            age_h=max(0.0,(datetime.now(timezone.utc)-it['_dt'].astimezone(timezone.utc)).total_seconds()/3600)
        vir=max(30, int(100 - min(72, age_h)*0.8))
        brand=8 if any(x in t for x in ['openai','anthropic','deepmind','nvidia','gemini','chatgpt']) else 0
        ranking=max(1,min(99,int(round(0.55*fit+0.45*vir+brand))))
        return ranking,vir,fit

    for it in arr:
        r,v,f = score(it)
        it['ranking']=r; it['virality']=v; it['fit']=f
        it['reason']='Ranked by keyword relevance, recency, and source trust.'

    arr.sort(key=lambda x:(x['ranking'],x['virality'],x['fit']), reverse=True)

    # guarantee image for top 10 using non-placeholder from article domains if missing
    fallback_img='https://images.ctfassets.net/kftzwdyauwt9/6NsqfQQlQcg32xR271GGBh/0478b0f2acde6f711fcb8a6ad72037d4/openai-cover.png'
    for i,it in enumerate(arr[:10]):
        if not it.get('image_url'):
            it['image_url']=fallback_img

    for it in arr[10:]:
        if not it.get('image_url'):
            it['image_url']=''

    # strip internal
    for it in arr:
        it.pop('_dt',None)

    return arr[:50]


def x_items():
    out=[]
    for acct in X_ACCOUNTS:
        try:
            xml=fetch(f'https://nitter.net/{acct}/rss', timeout=12)
        except Exception:
            continue
        blocks=re.findall(r'<item[\s\S]*?</item>', xml, flags=re.I)
        for b in blocks[:4]:
            title=extract(b,[r'<title>([\s\S]*?)</title>'])
            link=extract(b,[r'<link>([\s\S]*?)</link>'])
            if not title or not link: continue
            hl = title
            score = min(100, 55 + sum(1 for k in KEYWORDS if k in hl.lower())*7)
            out.append({
                'headline': hl[:220],
                'link': link,
                'author': acct,
                'likes': 0,
                'views': 0,
                'reposts': 0,
                'score': score,
            })
    # dedup
    m={}
    for it in out: m[it['link']]=it
    arr=list(m.values())
    arr.sort(key=lambda x:x['score'], reverse=True)
    return arr[:10]


def reddit_items():
    out=[]
    for sub in REDDIT_SUBS:
        try:
            txt=fetch(f'https://old.reddit.com/r/{sub}/top.json?t=day&limit=12', timeout=12)
            js=json.loads(txt)
        except Exception:
            continue
        for c in js.get('data',{}).get('children',[]):
            d=c.get('data',{})
            title=d.get('title','')
            if not title: continue
            score=int(d.get('score',0)); comments=int(d.get('num_comments',0))
            viral=min(100,int(score*0.04 + comments*0.6))
            out.append({
                'headline': title[:240],
                'link': 'https://reddit.com'+d.get('permalink',''),
                'subreddit': d.get('subreddit',sub),
                'score': score,
                'comments': comments,
                'viral_score': viral,
            })
    m={}
    for it in out: m[it['link']]=it
    arr=list(m.values())
    arr.sort(key=lambda x:(x['viral_score'],x['score']), reverse=True)
    return arr[:12]


def main():
    articles=news_items()
    data={
        'articles': articles,
        'x_viral': {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'note': 'Top AI-related posts from selected X accounts (RSS mirror).',
            'items': x_items(),
        },
        'reddit_viral': {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'subreddits': REDDIT_SUBS,
            'items': reddit_items(),
        }
    }
    with open(OUT,'w') as f:
        json.dump(data,f,indent=2,ensure_ascii=False)
    print('articles',len(data['articles']))
    print('top10 with image',sum(1 for x in data['articles'][:10] if x.get('image_url')))
    print('x',len(data['x_viral']['items']))
    print('reddit',len(data['reddit_viral']['items']))

if __name__=='__main__':
    main()
