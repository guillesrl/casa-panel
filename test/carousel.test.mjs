import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const carouselCards='),source.indexOf("$('#carousel').onclick=toggleCarousel;"));

test('carousel muestra clima, agenda, Alexa y noticias; al detenerlo vuelve a cuatro tarjetas',()=>{
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
  for(let i=0;i<4;i++){
    assert.deepEqual(names.filter(n=>!cards[n].hidden),[names[i]]);
    assert.equal(delay,i===3?20000:12000);
    if(i<3)callback();
  }
  vm.runInContext('toggleCarousel()',context);
  assert.equal(names.filter(n=>!cards[n].hidden).length,4);
  assert.equal(button.title,'Iniciar carrusel');
  assert.equal(callback,null);
});
