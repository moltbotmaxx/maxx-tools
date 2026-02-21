import fs from 'node:fs/promises';

const EMAIL = process.env.BCCR_EMAIL;
const TOKEN = process.env.BCCR_TOKEN;
const BASE = 'https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicosXML';

const IDS = {
  usdBuy: process.env.BCCR_ID_USD_BUY || '317',
  usdSell: process.env.BCCR_ID_USD_SELL || '318',
  eurBuy: process.env.BCCR_ID_EUR_BUY || '',
  eurSell: process.env.BCCR_ID_EUR_SELL || ''
};

const today = new Date();
const from = new Date(today.getTime() - 35 * 86400000);
const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

async function bccrSeries(indicador) {
  if (!EMAIL || !TOKEN || !indicador) return [];
  const u = new URL(BASE);
  u.searchParams.set('Indicador', indicador);
  u.searchParams.set('FechaInicio', fmt(from));
  u.searchParams.set('FechaFinal', fmt(today));
  u.searchParams.set('Nombre', 'Maxx');
  u.searchParams.set('SubNiveles', 'N');
  u.searchParams.set('CorreoElectronico', EMAIL);
  u.searchParams.set('Token', TOKEN);
  const r = await fetch(u);
  const x = await r.text();
  const out = [];
  for (const m of x.matchAll(/<INGC011_CAT_INDICADORECONOMIC>.*?<DES_FECHA>(.*?)<\/DES_FECHA>.*?<NUM_VALOR>(.*?)<\/NUM_VALOR>/gs)) {
    out.push({ date: m[1], value: Number(String(m[2]).replace(',', '.')) });
  }
  return out;
}

function mergeHistory(usdSell, eurSell){
  const map = new Map();
  for (const p of usdSell) map.set(p.date, { date: p.date, usdSell: p.value });
  for (const p of eurSell) map.set(p.date, { ...(map.get(p.date)||{date:p.date}), eurSell: p.value });
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
}

function change(s){ if(!s?.length||s.length<2) return null; return s.at(-1).value - s.at(-2).value; }

async function scrapeNews(){
  try {
    const r = await fetch('https://www.bccr.fi.cr/comunicacion-y-prensa');
    const html = await r.text();
    const items = [];
    for (const m of html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*(tipo de cambio|intervenci|mercado cambiario|divisas)[^<]*)<\/a>/gim)) {
      const url = m[1].startsWith('http') ? m[1] : `https://www.bccr.fi.cr${m[1]}`;
      items.push({ title: m[2].replace(/\s+/g,' ').trim(), url, date: null });
    }
    return items.slice(0,20);
  } catch { return []; }
}

const [usdBuy, usdSell, eurBuy, eurSell, news] = await Promise.all([
  bccrSeries(IDS.usdBuy), bccrSeries(IDS.usdSell), bccrSeries(IDS.eurBuy), bccrSeries(IDS.eurSell), scrapeNews()
]);

const output = {
  updatedAt: new Date().toISOString(),
  source: 'BCCR WebService + BCCR comunicaciones',
  usd: { buy: usdBuy.at(-1)?.value ?? null, sell: usdSell.at(-1)?.value ?? null, buyChange: change(usdBuy), sellChange: change(usdSell) },
  eur: { buy: eurBuy.at(-1)?.value ?? null, sell: eurSell.at(-1)?.value ?? null, buyChange: change(eurBuy), sellChange: change(eurSell) },
  history: mergeHistory(usdSell, eurSell),
  news
};

await fs.mkdir('data', { recursive: true });
await fs.writeFile('data/latest.json', JSON.stringify(output, null, 2));
console.log('updated data/latest.json');