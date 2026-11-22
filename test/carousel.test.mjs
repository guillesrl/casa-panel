import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const css=await readFile(new URL('../public/style.css',import.meta.url),'utf8');
const newsPair='.grid.carousel-active:has(>.news-card:not([hidden]))';

test('titulares del carrusel aumentan para lectura a distancia con interlineado legible',()=>{
  assert.ok(css.includes('.grid.carousel-active .news-copy h3{font-size:clamp(24px,2.4vw,34px);line-height:1.3}'));
});

test('tipografía de noticias fuera del carrusel conserva su tamaño normal',()=>{
  assert.ok(css.includes('.news-copy h3{font-size:17px}'));
  assert.ok(css.includes('.news-copy h3{display:block;overflow:visible;-webkit-line-clamp:unset;font-size:clamp(13px,1.05vw,16px);line-height:1.25}'));
});

test('carrusel Alexa/noticias reparte las columnas 30/70 solo cuando noticias está visible',()=>{
  assert.ok(css.includes(`${newsPair}{grid-template-columns:minmax(0,3fr) minmax(0,7fr)}`));
});

test('carrusel Alexa/noticias apilado reparte las filas 30/70 sin crear otra columna',()=>{
  assert.ok(css.includes(`@media (max-width:740px){${newsPair}{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,3fr) minmax(0,7fr)}}`));
});

test('se conservan cuadrantes estáticos y carrusel clima/agenda a partes iguales',()=>{
  assert.ok(css.includes('.grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));grid-template-areas:"weather calendar" "shopping news"}'));
  assert.ok(css.includes('.grid.carousel-active{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(0,1fr);grid-template-areas:none;min-height:0}'));
  assert.ok(css.includes('@media (max-width:740px){.grid.carousel-active{grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(2,minmax(0,1fr))}}'));
});

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
