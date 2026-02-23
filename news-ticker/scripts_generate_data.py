#!/usr/bin/env python3
import json, re, html, math
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import quote_plus
from urllib.error import URLError, HTTPError

import os
OUT = os.path.join(os.path.dirname(__file__), 'public', 'data.json')

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

    arr.sort(key=lambda x:(x['ranking'],x['virality'],x['fit']), reverse=True)

    # enforce real image urls for top 10; fetch og:image if feed omitted it
    for it in arr[:10]:
        if not it.get('image_url'):
            it['image_url'] = fetch_og_image(it.get('link', ''))

    # keep image optional outside top 10
    for it in arr[10:]:
        if not it.get('image_url'):
            it['image_url'] = ''

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
        for b in blocks[:10]:
            title=extract(b,[r'<title>([\s\S]*?)</title>'])
            link=extract(b,[r'<link>([\s\S]*?)</link>'])
            if not title or not link:
                continue

            text = title.lower()
            kw_hits = sum(1 for k in KEYWORDS if k in text)
            if kw_hits == 0 and not any(k in text for k in ['robot', 'ai', 'model', 'agent']):
                continue

            tweet_id = extract_tweet_id(link)
            likes, reposts, replies, views = fetch_tweet_metrics(tweet_id) if tweet_id else (0, 0, 0, 0)

            # Weighted engagement + relevance. If metrics are unavailable, score drops.
            engagement = likes + reposts*2 + replies*1.2 + views*0.02
            score = min(100, int(kw_hits*12 + math.log10(engagement + 1)*26))

            out.append({
                'headline': title[:220],
                'link': link,
                'author': acct,
                'likes': likes,
                'views': views,
                'reposts': reposts,
                'replies': replies,
                'keyword_hits': kw_hits,
                'score': score,
            })

    # dedup
    m={}
    for it in out:
        m[it['link']]=it
    arr=list(m.values())
    arr.sort(key=lambda x:(x['score'], x['likes'], x['views'], x['reposts']), reverse=True)
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
