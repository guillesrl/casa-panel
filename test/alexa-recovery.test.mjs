import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function reconnectAlexa(){'),source.indexOf("$('#alexa-reconnect').onclick"));

async function runRecovery(statuses){
  const calls=[];
  const button={disabled:false};
  const message={textContent:''};
  let rendered;
  const context={reconnecting:false,demo:false,busy:false,realData:{},
    $:selector=>selector==='#alexa-reconnect'?button:message,
    fetch:async url=>{calls.push(url);return {ok:true};},
    api:async url=>{calls.push(url);return url.includes('/status')?{status:statuses.shift()}:{status:'ok',data:{items:[]}};},
    renderShopping:value=>{rendered=value;},
    setTimeout:fn=>fn(),
  };
  vm.createContext(context);
  await vm.runInContext(`${code}\nreconnectAlexa()`,context);
  return {calls,button,message,rendered};
}

test('recuperacion abre Amazon antes de leer y actualiza la tarjeta',async()=>{
  const r=await runRecovery(['queued','running','ok']);
  assert.deepEqual(r.calls.slice(0,2),['/api/alexa-login','/api/alexa-reconnect/start']);
  assert.equal(r.calls.at(-1),'/api/shopping?refresh=reconnect');
  assert.equal(r.rendered.status,'ok');
  assert.equal(r.message.textContent,'Lista actualizada.');
  assert.equal(r.button.disabled,false);
});

test('recuperacion indica acceso VNC cuando la sesion lo requiere',async()=>{
  const r=await runRecovery(['login_required']);
  assert.match(r.message.textContent,/VNC/);
  assert.equal(r.calls.includes('/api/shopping?refresh=reconnect'),false);
  assert.equal(r.button.disabled,false);
});
