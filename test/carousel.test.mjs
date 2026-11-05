import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const carouselCards='),source.indexOf("$('#carousel').onclick=toggleCarousel;"));

test('carrusel muestra clima y agenda, después Alexa y noticias, y vuelve a cuatro tarjetas',()=>{
  const names=['.weather-card','.calendar-card','.shopping-card','.news-card'];
  const cards=Object.fromEntries(names.map(n=>[n,{hidden:false}]));
  let callback,delay;
  const classes=()=>({toggle(){}});
  const button={setAttribute(){},title:'',innerHTML:''};
  const elements={...cards,'.grid':{classList:classes()},'.shell':{classList:classes()},'#carousel':button};
  const context={ $:selector=>elements[selector], icon:name=>name,
    setTimeout:(fn,ms)=>{callback=fn;delay=ms;return 1;},clearTimeout:()=>{callback=null;} };
  vm.createContext(context);
  vm.runInContext(code,context);
  vm.runInContext('toggleCarousel()',context);
  assert.deepEqual(names.filter(n=>!cards[n].hidden),names.slice(0,2));
  assert.equal(delay,12000);
  callback();
  assert.deepEqual(names.filter(n=>!cards[n].hidden),names.slice(2,4));
  assert.equal(delay,20000);
  callback();
  assert.deepEqual(names.filter(n=>!cards[n].hidden),names.slice(0,2));
  vm.runInContext('toggleCarousel()',context);
  assert.equal(names.filter(n=>!cards[n].hidden).length,4);
  assert.equal(button.title,'Iniciar carrusel');
  assert.equal(callback,null);
});
