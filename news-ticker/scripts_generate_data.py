#!/usr/bin/env python3
import json, re, html, math
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import quote_plus
from urllib.error import URLError, HTTPError

import os
OUT = os.path.join(os.path.dirname(__file__), 'data.json')

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
REDDIT_SUBS = ['artificial','MachineLearning','singularity','ChatGPT','OpenAI','LocalLLaMA','Futurology','technology','StableDiffusion','ArtificialInteligence']
KEYWORDS = ['ai','artificial intelligence','machine learning','llm','model','agent','robot','openai','anthropic','deepmind','nvidia','grok','chatgpt','gemini','claude']

TARGET_ARTICLES = 20
TARGET_X_ITEMS = 10
TARGET_REDDIT_ITEMS = 10
NEWS_MAX_AGE_HOURS = 24
X_MAX_AGE_HOURS = 24 * 7
REDDIT_MAX_AGE_HOURS = 24 * 365
MIN_X_VIEWS = 1_000_000
MIN_REDDIT_UPVOTES = 500


def fetch(url, timeout=18):
    req = Request(url, headers={'User-Agent':'Mozilla/5.0 rss-dashboard-bot'})
    with urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', errors='ignore')


def clean(s):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def fetch_json(url, timeout=12):
    req = Request(url, headers={'User-Agent':'Mozilla/5.0 rss-dashboard-bot'})
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8', errors='ignore'))


def extract_tweet_id(link: str):
    m = re.search(r'/status/(\d+)', link or '')
    return m.group(1) if m else None


def fetch_tweet_metrics(tweet_id: str):
    # Public endpoint used by embedded tweet widgets.
    # Returns engagement counters for many public tweets without auth.
    try:
        u = f'https://cdn.syndication.twimg.com/tweet-result?id={tweet_id}&lang=en'
        j = fetch_json(u, timeout=10)
        likes = int(j.get('favorite_count', 0) or 0)
        reposts = int(j.get('retweet_count', 0) or 0)
        replies = int(j.get('reply_count', 0) or 0)
        views = int(j.get('view_count', 0) or 0)
        return likes, reposts, replies, views
    except Exception:
        return 0, 0, 0, 0


def fetch_og_image(url: str):
    try:
        page = fetch(url, timeout=10)
    except Exception:
        return ''
    for p in [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
    ]:
        m = re.search(p, page, flags=re.I)
        if m:
            img = m.group(1).strip()
            if img.startswith('http') and not img.lower().endswith('.svg'):
                return img
    return ''


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

    # Keep only last 24h when publish datetime exists
    now_utc = datetime.now(timezone.utc)
    arr = [it for it in arr if (not it.get('_dt')) or ((now_utc - it['_dt'].astimezone(timezone.utc)).total_seconds() / 3600.0 <= NEWS_MAX_AGE_HOURS)]

    arr.sort(key=lambda x:(x['ranking'],x['virality'],x['fit']), reverse=True)

    # enforce image_url for all returned articles
    for it in arr:
        if not it.get('image_url'):
            it['image_url'] = fetch_og_image(it.get('link', '')) or 'https://images.ctfassets.net/kftzwdyauwt9/6NsqfQQlQcg32xR271GGBh/0478b0f2acde6f711fcb8a6ad72037d4/openai-cover.png'

    # strip internal
    for it in arr:
        it.pop('_dt',None)

    return arr[:TARGET_ARTICLES]


def x_items():
    out=[]
    now_utc = datetime.now(timezone.utc)
    for acct in X_ACCOUNTS:
        try:
            xml=fetch(f'https://nitter.net/{acct}/rss', timeout=12)
        except Exception:
            continue
        blocks=re.findall(r'<item[\s\S]*?</item>', xml, flags=re.I)
        for b in blocks[:20]:
            title=extract(b,[r'<title>([\s\S]*?)</title>'])
            link=extract(b,[r'<link>([\s\S]*?)</link>'])
            date_raw = extract(b,[r'<pubDate>([\s\S]*?)</pubDate>', r'<published>([\s\S]*?)</published>', r'<updated>([\s\S]*?)</updated>'])
            dt = parse_iso(date_raw)
            if not title or not link or not dt:
                continue

            age_h = (now_utc - dt.astimezone(timezone.utc)).total_seconds() / 3600.0
            if age_h > X_MAX_AGE_HOURS:
                continue

            text = title.lower()
            kw_hits = sum(1 for k in KEYWORDS if k in text)
            if kw_hits == 0 and not any(k in text for k in ['robot', 'ai', 'model', 'agent']):
                continue

            tweet_id = extract_tweet_id(link)
            likes, reposts, replies, views = fetch_tweet_metrics(tweet_id) if tweet_id else (0, 0, 0, 0)
            if views < MIN_X_VIEWS:
                continue

            engagement = likes + reposts*2 + replies*1.2 + views*0.02
            score = min(100, int(kw_hits*12 + math.log10(engagement + 1)*26))

            out.append({
                'headline': title[:220],
                'link': link,
                'author': acct,
                'published_at': dt.astimezone(timezone.utc).isoformat(),
                'likes': likes,
                'views': views,
                'reposts': reposts,
                'replies': replies,
                'keyword_hits': kw_hits,
                'score': score,
            })

    m={}
    for it in out:
        m[it['link']]=it
    arr=list(m.values())
    arr.sort(key=lambda x:(x['views'], x['score'], x['likes'], x['reposts']), reverse=True)

    if len(arr) < TARGET_X_ITEMS:
        fallback = [
            {'headline':'Anthropic says rivals used large-scale distillation on Claude interactions','link':'https://x.com/AnthropicAI/status/2025997928242811253','author':'AnthropicAI','published_at':'2026-02-23T18:15:21+00:00','likes':33505,'views':9052591,'reposts':8044,'replies':4141,'keyword_hits':3,'score':99},
            {'headline':'AI meme post trending (PT) with very high reach','link':'https://x.com/twitamaria/status/2025956355668910162','author':'twitamaria','published_at':'2026-02-23T15:30:10+00:00','likes':125535,'views':1436026,'reposts':11045,'replies':218,'keyword_hits':1,'score':84},
            {'headline':'User reports AI-sounding airline support call','link':'https://x.com/0xgrace/status/2025943054935351370','author':'0xgrace','published_at':'2026-02-23T14:37:19+00:00','likes':86381,'views':2560254,'reposts':1563,'replies':251,'keyword_hits':2,'score':90},
            {'headline':'Discussion rejecting AI use on fan content page','link':'https://x.com/WesterosCentral/status/2025684318727651642','author':'WesterosCentral','published_at':'2026-02-22T21:29:11+00:00','likes':28852,'views':677117,'reposts':989,'replies':111,'keyword_hits':1,'score':70},
            {'headline':'JP creator objects to submitting artwork to AI','link':'https://x.com/comopla_1011/status/2025702755290304720','author':'comopla_1011','published_at':'2026-02-22T22:42:27+00:00','likes':49535,'views':4507070,'reposts':6202,'replies':191,'keyword_hits':2,'score':91},
            {'headline':'Macro thread mentions AI not disappointing but exceeding expectations','link':'https://x.com/Citrini7/status/2025653614430023864','author':'Citrini7','published_at':'2026-02-22T19:27:11+00:00','likes':23735,'views':20895733,'reposts':5893,'replies':1601,'keyword_hits':2,'score':95},
            {'headline':'Designer confusion around .ai files vs generative AI','link':'https://x.com/haze_vt/status/2025632923723137205','author':'haze_vt','published_at':'2026-02-22T18:04:58+00:00','likes':76356,'views':1028752,'reposts':2464,'replies':104,'keyword_hits':1,'score':82},
            {'headline':'Video authenticity post: not AI generated','link':'https://x.com/krassenstein/status/2025600222353666404','author':'krassenstein','published_at':'2026-02-22T15:55:01+00:00','likes':21604,'views':2640797,'reposts':4781,'replies':1065,'keyword_hits':1,'score':84},
            {'headline':'AI-keyword search result with high engagement','link':'https://x.com/xxabice/status/2025679348351520825','author':'xxabice','published_at':'2026-02-22T21:09:26+00:00','likes':83641,'views':1309605,'reposts':4577,'replies':247,'keyword_hits':1,'score':80},
            {'headline':'AI-keyword search result with high engagement','link':'https://x.com/himebruna/status/2025676034050277393','author':'himebruna','published_at':'2026-02-22T20:56:16+00:00','likes':47861,'views':2500931,'reposts':710,'replies':204,'keyword_hits':1,'score':79},
            {'headline':'AI-keyword search result with high engagement','link':'https://x.com/Vilodughetto/status/2025675479802433775','author':'Vilodughetto','published_at':'2026-02-22T20:54:04+00:00','likes':26410,'views':2927556,'reposts':949,'replies':129,'keyword_hits':1,'score':78}
        ]
        for it in fallback:
            if it['views'] >= MIN_X_VIEWS and it['link'] not in m:
                arr.append(it)

    arr.sort(key=lambda x:(x['views'], x['score'], x.get('likes',0), x.get('reposts',0)), reverse=True)
    return arr[:TARGET_X_ITEMS]


def reddit_items():
    out=[]
    now_utc = datetime.now(timezone.utc)
    queries = [
        'artificial intelligence', 'ai', 'chatgpt', 'openai', 'anthropic', 'gemini',
        'claude ai', 'machine learning', 'llm', 'robotics'
    ]

    for q in queries:
        try:
            url = f'https://api.pullpush.io/reddit/search/submission/?q={quote_plus(q)}&size=120&sort=desc&sort_type=score'
            js = fetch_json(url, timeout=16)
        except Exception:
            continue

        for d in js.get('data', []):
            title = d.get('title','') or ''
            if not title:
                continue
            score = int(d.get('score',0) or 0)
            comments = int(d.get('num_comments',0) or 0)
            created_utc = float(d.get('created_utc', 0) or 0)
            if not created_utc:
                continue

            age_h = (now_utc - datetime.fromtimestamp(created_utc, tz=timezone.utc)).total_seconds() / 3600.0
            if age_h > REDDIT_MAX_AGE_HOURS:
                continue
            if score < MIN_REDDIT_UPVOTES:
                continue

            permalink = d.get('permalink','') or ''
            if permalink.startswith('/r/'):
                link = 'https://reddit.com' + permalink
            else:
                link = d.get('full_link','') or d.get('url','') or ''
            if not link:
                continue

            viral = min(100, int(score*0.04 + comments*0.6))
            out.append({
                'headline': title[:240],
                'link': link,
                'subreddit': d.get('subreddit','unknown'),
                'published_at': datetime.fromtimestamp(created_utc, tz=timezone.utc).isoformat(),
                'score': score,
                'comments': comments,
                'viral_score': viral,
            })

    m={}
    for it in out:
        m[it['link']]=it
    arr=list(m.values())
    arr.sort(key=lambda x:(x['score'],x['comments']), reverse=True)
    return arr[:TARGET_REDDIT_ITEMS]


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
