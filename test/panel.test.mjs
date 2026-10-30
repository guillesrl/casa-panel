import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCalendar,parseNews,parseShopping,cached,createServer,REFRESH_MS} from '../server.mjs';
const wrap=events=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR`;
test('15-minute refresh and cache retain last data on failure',async()=>{assert.equal(REFRESH_MS,900000);let fail=false;const get=cached(async()=>{if(fail)throw new Error();return [1];});const first=await get();fail=true;assert.equal(await get(),first);const real=Date.now;Date.now=()=>real()+REFRESH_MS+1;try{const stale=await get();assert.equal(stale.status,'stale');assert.deepEqual(stale.data,[1]);assert.equal(stale.updatedAt,first.updatedAt);}finally{Date.now=real;}});
test('unconfigured sources make no requests',async()=>{assert.equal((await cached(()=>{throw new Error();},false)()).status,'unconfigured');});
test('calendar handles recurrence, exclusions, overrides, cancellation and DST',async()=>{
const result=await parseCalendar(wrap(`BEGIN:VEVENT
UID:recurring
DTSTART;TZID=Europe/Andorra:20261023T100000
DTEND;TZID=Europe/Andorra:20261023T110000
RRULE:FREQ=DAILY;COUNT=5
EXDATE;TZID=Europe/Andorra:20261024T100000
SUMMARY:Daily
END:VEVENT
BEGIN:VEVENT
UID:recurring
RECURRENCE-ID;TZID=Europe/Andorra:20261026T100000
DTSTART;TZID=Europe/Andorra:20261026T120000
DTEND;TZID=Europe/Andorra:20261026T130000
SUMMARY:Moved
END:VEVENT
BEGIN:VEVENT
UID:cancelled
DTSTART:20261025T120000Z
DTEND:20261025T130000Z
SUMMARY:Cancelled
STATUS:CANCELLED
END:VEVENT`),new Date('2026-10-23T00:00:00Z'));
assert.equal(result.length,4);assert.equal(result[0].start,'2026-10-23T08:00:00.000Z');assert.equal(result[1].start,'2026-10-25T09:00:00.000Z');assert.equal(result[2].start,'2026-10-26T11:00:00.000Z');assert.equal(result[2].title,'Moved');});
test('calendar includes all-day and ongoing events, omits expired events',async()=>{const r=await parseCalendar(wrap(`BEGIN:VEVENT
UID:allday
DTSTART;VALUE=DATE:20261030
DTEND;VALUE=DATE:20261031
SUMMARY:All day
END:VEVENT
BEGIN:VEVENT
UID:past
DTSTART:20261029T080000Z
DTEND:20261029T090000Z
SUMMARY:Past
END:VEVENT`),new Date('2026-10-30T12:00:00Z'));assert.equal(r.length,1);assert.equal(r[0].allDay,true);});
test('RSS decodes titles and blocks script links',()=>{const r=parseNews('<rss><channel><title>News</title><item><title>A &amp; B</title><link>https://example.com/a</link></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>');assert.equal(r.length,1);assert.equal(r[0].title,'A & B');assert.throws(()=>parseNews('<html>error</html>'));});
test('Alexa adapter requires explicit completion and freshness metadata',()=>{assert.throws(()=>parseShopping({items:[]}));assert.throws(()=>parseShopping({updatedAt:new Date().toISOString(),items:[{name:'Leche',completed:'false'}]}));assert.equal(parseShopping({updatedAt:new Date().toISOString(),items:[{id:1,name:'Leche',completed:false}]}).items[0].completed,false);});
test('production refuses unprotected startup; basic auth protects page and API',async()=>{process.env.NODE_ENV='production';assert.throws(()=>createServer());process.env.DASHBOARD_USER='test';process.env.DASHBOARD_PASSWORD='test-password';const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;try{assert.equal((await fetch(url+'/healthz')).status,200);assert.equal((await fetch(url+'/api/config')).status,401);const r=await fetch(url+'/api/config',{headers:{Authorization:'Basic '+Buffer.from('test:test-password').toString('base64')}});assert.equal(r.status,200);assert.equal((await r.json()).refreshMs,900000);}finally{await new Promise(r=>server.close(r));delete process.env.NODE_ENV;delete process.env.DASHBOARD_USER;delete process.env.DASHBOARD_PASSWORD;}});
