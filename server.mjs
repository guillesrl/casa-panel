import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {XMLParser} from 'fast-xml-parser';
import ical from 'node-ical';

export const REFRESH_MS = 15 * 60 * 1000;
const env = process.env;
const zone = env.TZ || 'Europe/Andorra';
const config = {city: env.WEATHER_CITY || 'Andorra la Vella', timezone: zone, refreshMs: REFRESH_MS};
const xml = new XMLParser({ignoreAttributes:false, processEntities:true});
const text = x => typeof x === 'object' ? String(x?.val ?? x?.['#text'] ?? '') : String(x ?? '');
const safeURL = s => {try {const u=new URL(s); return ['https:','http:'].includes(u.protocol)?u.href:null;} catch {return null;}};

export function parseNews(body) {
  const doc=xml.parse(body);
  const channel=doc.rss?.channel;
  const entries=channel?.item ?? doc.feed?.entry;
  if (!entries) throw new Error('Invalid RSS');
  return (Array.isArray(entries)?entries:[entries]).slice(0,8).map(x=>({
    title:text(x.title).replace(/<[^>]*>/g,''),
    url:safeURL(typeof x.link==='string'?x.link:x.link?.['@_href']),
    source:text(channel?.title||doc.feed?.title||'Noticias'),
    publishedAt: Number.isFinite(Date.parse(x.pubDate||x.published||x.updated))?new Date(x.pubDate||x.published||x.updated).toISOString():null
  })).filter(x=>x.title && x.url);
}
export async function parseCalendar(body, now=new Date()) {
  if (!body.includes('BEGIN:VCALENDAR')) throw new Error('Invalid calendar');
  const data=await ical.async.parseICS(body);
  const until=new Date(+now+7*86400000);
  const list=[];
  for (const event of Object.values(data)) {
    if(event.type!=='VEVENT'||event.status==='CANCELLED') continue;
    const occurrences=ical.expandRecurringEvent(event,{from:now,to:until,expandOngoing:true});
    for(const item of occurrences) {
      if(item.event?.status==='CANCELLED'||item.status==='CANCELLED') continue;
      list.push({title:text(item.summary||event.summary)||'Sin título',start:item.start.toISOString(),end:item.end.toISOString(),allDay:!!item.isFullDay,location:text(item.event?.location||event.location)});
    }
  }
  return list.sort((a,b)=>a.start.localeCompare(b.start)).slice(0,30);
}
export function parseShopping(data) {
  if (!Array.isArray(data.items)||data.items.length>300) throw new Error('Invalid items');
  const updatedAt=Date.parse(data.updatedAt);
  if(!Number.isFinite(updatedAt)||updatedAt>Date.now()+60000) throw new Error('Missing source timestamp');
  return {items:data.items.map((x,i)=>{
    if(typeof x.name!=='string'||!x.name.trim()||x.name.length>300||typeof x.completed!=='boolean') throw new Error('Invalid item');
    return {id:String(x.id??i),name:x.name.trim(),completed:x.completed};
  }),updatedAt:new Date(updatedAt).toISOString()};
}
async function fetchText(url,headers={}) {
  const parsed=new URL(url);
  const internalHTTP=parsed.protocol==='http:'&&env.ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP==='true'&&parsed.hostname==='alexa-shopping-reader';
  if(parsed.protocol!=='https:'&&!internalHTTP) throw new Error('HTTPS required');
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error('Upstream unavailable');
  let size=0; const chunks=[];
  for await(const chunk of response.body) {size+=chunk.length;if(size>5_000_000) throw new Error('Response too large');chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}
async function postText(url,headers={}) {
  const parsed=new URL(url);
  const internalHTTP=parsed.protocol==='http:'&&env.ALEXA_BRIDGE_ALLOW_INTERNAL_HTTP==='true'&&parsed.hostname==='alexa-shopping-reader';
  if(parsed.protocol!=='https:'&&!internalHTTP) throw new Error('HTTPS required');
  const response=await fetch(url,{method:'POST',headers,signal:AbortSignal.timeout(12000)});
  let size=0; const chunks=[];
  for await(const chunk of response.body) {size+=chunk.length;if(size>100_000) throw new Error('Response too large');chunks.push(chunk);}
  if(!response.ok) throw new Error('Upstream unavailable');
  return Buffer.concat(chunks).toString('utf8');
}
export function cached(loader, enabled=true) {
  let last=null, checked=0, pending=null;
  return async(force=false)=>{
    if(!enabled) return {status:'unconfigured',data:null,updatedAt:null};
    if(pending) return pending;
    if(last && Date.now()-checked < (force?30000:REFRESH_MS)) return last;
    pending=(async()=>{try {
      const data=await loader();
      last={status:'ok',data,updatedAt:new Date().toISOString()};
    } catch {last={status:last?.data?'stale':'error',data:last?.data??null,updatedAt:last?.updatedAt??null};}
    checked=Date.now();return last;})();
    try{return await pending;}finally{pending=null;}
  };
}
const weather=cached(async()=>{
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:env.WEATHER_LAT||'42.5063',longitude:env.WEATHER_LON||'1.5218',current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',hourly:'temperature_2m,weather_code',forecast_days:'2',timezone:zone,timeformat:'unixtime'});
  const data=JSON.parse(await fetchText(url));
  if(typeof data.current?.temperature_2m!=='number'||!data.daily||!data.hourly) throw new Error('Invalid weather');
  return data;
});
const defaultNewsFeeds=[
  env.NEWS_RSS_URL||'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',
  'https://feeds.bbci.co.uk/mundo/rss.xml',
  'https://es.euronews.com/rss?format=mrss&level=theme&name=news'
];
async function loadNews(){
  const feeds=(env.NEWS_RSS_URLS?env.NEWS_RSS_URLS.split(/[\n,]/):defaultNewsFeeds).map(url=>url.trim()).filter(Boolean);
  const results=await Promise.allSettled(feeds.map(async url=>parseNews(await fetchText(url))));
  const articles=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  const seen=new Set();
  const unique=articles.filter(article=>{
    const key=article.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
  unique.sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
  if(!unique.length)throw new Error('All news feeds unavailable');
  return unique.slice(0,24);
}
const news=cached(loadNews);
const calendar=cached(async()=>parseCalendar(await fetchText(env.GOOGLE_CALENDAR_ICS_URL)),!!env.GOOGLE_CALENDAR_ICS_URL);
const shopping=cached(async()=>parseShopping(JSON.parse(await fetchText(env.ALEXA_BRIDGE_URL,env.ALEXA_BRIDGE_TOKEN?{Authorization:`Bearer ${env.ALEXA_BRIDGE_TOKEN}`}:{ }))),!!env.ALEXA_BRIDGE_URL);
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function createServer(){
  if(env.NODE_ENV==='production'&&(!env.DASHBOARD_USER||!env.DASHBOARD_PASSWORD)) throw new Error('Set DASHBOARD_USER and DASHBOARD_PASSWORD before production start');
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
    try {
      const u=new URL(req.url,'http://localhost');
      if(u.pathname==='/healthz') return send(200,{ok:true});
      const publicAsset=u.pathname==='/manifest.webmanifest';
      if(env.DASHBOARD_PASSWORD&&!publicAsset) {
        const supplied=(req.headers.authorization||'').startsWith('Basic ')?Buffer.from(req.headers.authorization.slice(6),'base64').toString():'';
        if(!equal(supplied,`${env.DASHBOARD_USER||'casa'}:${env.DASHBOARD_PASSWORD}`)) {res.setHeader('WWW-Authenticate','Basic realm="Casa", charset="UTF-8"');return send(401,{error:'Autenticación necesaria'});}
      }
      if(u.pathname==='/api/config') return send(200,config);
      if(u.pathname==='/api/alexa-login') {
        if(req.method!=='POST') return send(405,{error:'Método no permitido'});
        if(!env.ALEXA_BRIDGE_URL) return send(503,{status:'unconfigured'});
        const url=new URL('/login/start',env.ALEXA_BRIDGE_URL).href;
        const body=await postText(url,env.ALEXA_BRIDGE_TOKEN?{Authorization:`Bearer ${env.ALEXA_BRIDGE_TOKEN}`}:{ });
        return send(202,JSON.parse(body));
      }
      if(req.method!=='GET'&&req.method!=='HEAD') return send(405,{error:'Método no permitido'});
      const loaders={weather,news,calendar,shopping};
      const name=u.pathname.replace('/api/','');
      if(u.pathname.startsWith('/api/')&&loaders[name]) return send(200,await loaders[name](u.searchParams.get('refresh')==='1'));
      const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/icon.svg':'icon.svg','/manifest.webmanifest':'manifest.webmanifest'};
      const file=files[u.pathname];
      if(!file) return send(404,{error:'No encontrado'});
      const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
      return send(200,await readFile(new URL(`./public/${file}`,import.meta.url)),types[file.split('.').at(-1)]);
    } catch {send(500,{error:'No se pudo completar la petición'});}
  });
}
const portArg=process.argv.indexOf('--port');
const port=portArg>=0?Number(process.argv[portArg+1]):Number(env.PORT)||3000;
if(process.argv[1]===fileURLToPath(import.meta.url)) createServer().listen(port,'0.0.0.0',()=>console.log(`Casa ready on port ${port}`));
