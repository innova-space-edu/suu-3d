import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {FairFlow,FairMotion,FairRecording,calibrateFair,validCalibration}=await import('data:text/javascript;base64,'+Buffer.from(compile('lib/fair-flow.ts')).toString('base64'));
test('a crowd gets one complete welcome; continuing traffic repeats only after completion and a gap',()=>{
 const flow=new FairFlow();flow.observe(0,true,true);assert.equal(flow.poll(0,true),'welcome');
 for(let now=250;now<=12000;now+=250){flow.observe(now,true,true);assert.equal(flow.poll(now,true),null)}
 flow.complete(12000);assert.equal(flow.poll(13000,true),null);flow.observe(13500,true,false);assert.equal(flow.poll(13500,true),'welcome');
});
test('a completed greeting does not drain a per-student queue',()=>{
 const flow=new FairFlow();flow.observe(0,true,false);flow.poll(0,true);
 for(let i=1;i<30;i++)flow.observe(i*100,true,false);
 flow.complete(10000);assert.equal(flow.poll(11500,true),null);
});
test('entries suppress departures, including stale exits during a welcome',()=>{
 const flow=new FairFlow();flow.observe(0,false,true);flow.observe(100,true,true);assert.equal(flow.poll(100,true),'welcome');flow.complete(10000);assert.equal(flow.poll(11500,true),null);
 flow.observe(12000,false,true);assert.equal(flow.poll(12000,true),'goodbye');flow.complete(18000);assert.equal(flow.poll(20000,true),null);
});
test('busy conversations defer speech but do not store stale greetings',()=>{
 const flow=new FairFlow();flow.observe(0,true,false);assert.equal(flow.poll(0,false),null);assert.equal(flow.poll(8000,true),null);
 flow.observe(9000,true,false);assert.equal(flow.poll(9000,true),'welcome');
});
test('departure waits for entry quiet period and expires while questions are answered',()=>{
 const flow=new FairFlow();flow.observe(0,true,false);flow.observe(2000,false,true);assert.equal(flow.poll(2200,true),null);assert.equal(flow.poll(3100,true),'goodbye');flow.complete(4000);
 flow.observe(6000,false,true);assert.equal(flow.poll(6000,false),null);assert.equal(flow.poll(12000,true),null);
});
const walk=(from,to)=>Array.from({length:24},(_,i)=>({x:from+(to-from)*i/23,y:.5,size:.3}));
test('calibration learns opposite routes, rejects weak or matching directions and validates saved data',()=>{
 const c=calibrateFair(walk(.2,.8),walk(.8,.2));assert.equal(c.axis,'x');assert.equal(c.direction,1);assert.ok(validCalibration(c));
 assert.throws(()=>calibrateFair(walk(.2,.8),walk(.2,.8)));assert.throws(()=>calibrateFair(walk(.5,.51),walk(.51,.5)));assert.throws(()=>calibrateFair([],[]));
 assert.equal(validCalibration({...c,high:NaN}),false);assert.equal(validCalibration({...c,axis:'identity'}),false);
});
const box=x=>({x,y:.2,width:.15,height:.6});
test('anonymous body tracks distinguish movement and ignore stationary people or missed frames',()=>{
 const c=calibrateFair(walk(.2,.8),walk(.8,.2)),motion=new FairMotion();
 let result;for(let i=0;i<5;i++)result=motion.update([box(.2+i*.04)],i*250,c);
 assert.equal(result.entering,true);assert.equal(result.leaving,false);
 for(let i=5;i<12;i++)result=motion.update([box(.36)],i*250,c);
 assert.equal(result.entering,false);assert.equal(result.leaving,false);
 assert.deepEqual(motion.update([],3100,c),{entering:false,leaving:false});
});
test('simultaneous opposite tracks report both; the speech arbiter still chooses welcome',()=>{
 const c=calibrateFair(walk(.1,.9),walk(.9,.1)),motion=new FairMotion();let result;
 for(let i=0;i<4;i++)result=motion.update([box(.1+i*.04),box(.7-i*.04)],i*250,c);
 assert.deepEqual(result,{entering:true,leaving:true});const flow=new FairFlow();flow.observe(1000,result.entering,result.leaving);assert.equal(flow.poll(1000,true),'welcome');
});
test('the guide catalog provides project topics without publishing student identities',async()=>{
 const {FAIR_EXHIBITS,fairGuideInstructions}=await import('data:text/javascript;base64,'+Buffer.from(compile('lib/fair-guide.ts')).toString('base64'));
 assert.equal(FAIR_EXHIBITS.length,15);assert.ok(FAIR_EXHIBITS.some(e=>e.title==='Museo Vivo'));assert.match(fairGuideInstructions(),/salvo que el visitante lo pregunte explícitamente/);assert.match(fairGuideInstructions(),/No hay autores verificados/);
});

test('project questions use only the attached catalog, including astronomy and unknown exhibits',async()=>{
 const {fairProjectAnswer}=await import('data:text/javascript;base64,'+Buffer.from(compile('lib/fair-guide.ts')).toString('base64'));
 const ask=content=>fairProjectAnswer([{role:'user',content}]);
 const astro=ask('Háblanos de los trabajos de astronomía de la Expo Ciencias');
 assert.match(astro,/Proyecto ALMA/);assert.match(astro,/Adelina/);assert.match(astro,/telescopio/);assert.ok(!/agujeros|constelaciones|maquetas interactivas/i.test(astro));
 assert.match(ask('Cuéntanos sobre Museo Vivo'),/clasificación taxonómica/);
 assert.match(ask('Háblanos del proyecto de robótica en Marte'),/No tengo una ficha/);
 assert.match(ask('¿Qué proyectos de robótica hay?'),/No tengo una ficha/);
 assert.match(ask('¿Quién creó el proyecto ALMA?'),/No tengo la autoría/);
 assert.match(ask('¿Cuánto cuesta el proyecto Museo Vivo?'),/no está registrado/i);
 assert.match(ask('Cuéntennos sobre los trabajos'),/Museo Vivo/);assert.match(ask('Háblanos de algún proyecto'),/Museo Vivo/);
 const listing=ask('¿Qué proyectos hay en la feria?');assert.match(listing,/Museo Vivo/);assert.match(listing,/Arte reciclado/);
 const follow=fairProjectAnswer([{role:'user',content:'Proyecto ALMA'},{role:'assistant',content:'Hay robots que fabrican cohetes'},{role:'user',content:'¿Cómo funciona ese proyecto?'}]);assert.match(follow,/Chajnantor/);assert.ok(!follow.includes('robots'));
 assert.equal(ask('Hola, ¿cómo están?'),null);
});

test('prepared fair answers handle paraphrases and contextual follow-ups without a completion',async()=>{
 const {fairProjectAnswer:answer}=await import('data:text/javascript;base64,'+Buffer.from(compile('lib/fair-guide.ts')).toString('base64'));
 const ask=q=>answer([{role:'user',content:q}]);
 for(const q of ['¿Cómo te llamas?','¿Quién eres?','¿Cuál es tu nombre?'])assert.match(ask(q),/Mi nombre es SUU/);
 for(const q of ['Dime sobre los trabajos.','Háblame de los proyectos','¿Qué trabajos hay?'])assert.match(ask(q),/Arte reciclado.*Museo Vivo/);
 const history=[{role:'user',content:'Háblame de astronomía'},{role:'assistant',content:ask('Háblame de astronomía')},{role:'user',content:'¿Cuál más tienes?'}];
 const more=answer(history);assert.match(more,/Arte reciclado/);assert.ok(!more.includes('Proyecto ALMA'));
 assert.match(answer([{role:'user',content:'Consumo de drogas'},{role:'assistant',content:ask('Consumo de drogas')},{role:'user',content:'¿Quién lo hizo?'}]),/No tengo la autoría/);
 assert.equal(ask('Explícame la física cuántica'),null);
 assert.match(ask('¿Qué trabajos de robótica hay?'),/No tengo una ficha/);
});

test('recording accepts a brief crossing with empty frames before and after',()=>{
 const run=new FairRecording();for(let i=0;i<12;i++)run.add([]);
 for(let i=0;i<8;i++)run.add([box(.1+i*.07)]);
 for(let i=0;i<12;i++)run.add([]);
 const entry=run.finish();assert.equal(entry.length,8);
 assert.ok(validCalibration(calibrateFair(entry,[...entry].reverse())));
});
test('recording rejects absent people and crowded recordings',()=>{
 const empty=new FairRecording();for(let i=0;i<24;i++)empty.add([]);assert.throws(()=>empty.finish(),/suficiente/);
 const crowd=new FairRecording();for(let i=0;i<8;i++)crowd.add([box(.2)]);
 for(let i=0;i<8;i++)crowd.add([box(.2),box(.7)]);assert.throws(()=>crowd.finish(),/varias/);
});
