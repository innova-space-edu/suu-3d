import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=p=>ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {fairRecordingVoice,fairAudioChunks,prepareFairAudio,playFairAudio,clearFairAudio}=await import('data:text/javascript;base64,'+Buffer.from(compile('lib/fair-audio.ts')).toString('base64'));
const {FAIR_SCRIPTS,FairFlow}=await import('data:text/javascript;base64,'+Buffer.from(compile('lib/fair-flow.ts')).toString('base64'));
const audio=()=>new Blob([new Uint8Array(200)],{type:'audio/wav'});
function storage(){const entries=new Map();return {entries,open:async()=>({match:async k=>entries.get(k)?.clone(),put:async(k,r)=>entries.set(k,r.clone()),keys:async()=>[...entries.keys()].map(k=>new Request(k)),delete:async k=>entries.delete(k.url??k)}),delete:async()=>{entries.clear();return true}}}
test('complete narration includes every exhibit and splits without losing the ending',()=>{
 const chunks=fairAudioChunks(FAIR_SCRIPTS.welcome);assert.ok(chunks.length>5);assert.ok(chunks.every(p=>p.length<=600));
 assert.equal(chunks.join(' ').replace(/\s+/g,' '),FAIR_SCRIPTS.welcome.replace(/\s+/g,' '));
 for(const topic of ['Arte reciclado','Reutilización natural','Mural decorativo','Octavio','Museo Vivo','ALMA','telescopio','Adelina','impacto ambiental','Uso excesivo','Manejo de las emociones','Salud mental','Alimentación saludable','Prevención del consumo','Colegio Providencia sustentable'])assert.ok(FAIR_SCRIPTS.welcome.includes(topic),topic);
 assert.match(chunks.at(-1),/¡Disfruten la Expo Ciencias!/);
});
test('entry-only mode never announces departures or queues arrivals during narration',()=>{
 const flow=new FairFlow(true);flow.observe(0,false,true);assert.equal(flow.poll(0,true),null);
 flow.observe(100,true,false);assert.equal(flow.poll(100,true),'welcome');
 flow.observe(1000,true,false);assert.equal(flow.poll(1000,true),null);
 flow.complete(120000);assert.equal(flow.poll(122000,true),null);
 flow.observe(123000,false,true);assert.equal(flow.poll(123000,true),null);
 flow.observe(124000,true,false);assert.equal(flow.poll(124000,true),'welcome');
});
test('exit suppresses a pending arrival, while simultaneous entry retains priority',()=>{
 const flow=new FairFlow(true);flow.observe(0,true,false);flow.observe(200,false,true);assert.equal(flow.poll(300,true),null);
 flow.observe(400,true,true);assert.equal(flow.poll(400,true),'welcome');
});
test('saved recording is reused after reopening with zero additional synthesis',async()=>{
 const disk=storage(),ctl=new AbortController();let calls=0;const synth=async()=>{calls++;return audio()};
 const first=await prepareFairAudio(FAIR_SCRIPTS.welcome,'piper',ctl.signal,synth,()=>{},disk);assert.ok(first.persisted);assert.equal(calls,first.clips.length);
 calls=0;const second=await prepareFairAudio(FAIR_SCRIPTS.welcome,'piper',ctl.signal,synth,()=>{},disk);assert.equal(calls,0);assert.equal(second.clips.length,first.clips.length);
 await prepareFairAudio(FAIR_SCRIPTS.welcome,'another-voice',ctl.signal,synth,()=>{},disk);assert.equal(calls,first.clips.length);assert.equal(disk.entries.size,first.clips.length);
 await clearFairAudio(disk);assert.equal(disk.entries.size,0);
});
test('failed generation resumes only missing clips and does not claim a complete recording',async()=>{
 const disk=storage(),ctl=new AbortController();let calls=0;
 await assert.rejects(prepareFairAudio(FAIR_SCRIPTS.welcome,'piper',ctl.signal,async()=>{if(++calls===3)throw Error('offline');return audio()},()=>{},disk),/offline/);
 assert.equal(disk.entries.size,2);calls=0;
 const result=await prepareFairAudio(FAIR_SCRIPTS.welcome,'piper',ctl.signal,async()=>{calls++;return audio()},()=>{},disk);assert.equal(calls,result.clips.length-2);
});
test('storage denial preserves session playback without claiming persistence',async()=>{
 const disk={open:async()=>{throw Error('quota')}};
 const result=await prepareFairAudio('Bienvenidos.','piper',new AbortController().signal,async()=>audio(),()=>{},disk);assert.equal(result.persisted,false);assert.equal(result.clips.length,1);
});
test('cancelled generation does not save the clip or keep synthesizing',async()=>{
 const disk=storage(),ctl=new AbortController();let calls=0;
 await assert.rejects(prepareFairAudio(FAIR_SCRIPTS.welcome,'piper',ctl.signal,async()=>{calls++;ctl.abort();return audio()},()=>{},disk));assert.equal(calls,1);assert.equal(disk.entries.size,0);
});
test('HTML responses are rejected instead of cached as audio',async()=>{
 await assert.rejects(prepareFairAudio('Hola','piper',new AbortController().signal,async()=>new Blob(['x'.repeat(200)],{type:'text/html'}),()=>{},storage()),/inválido/);
});
test('playback follows all saved clips and cancellation releases its URL',async()=>{
 const previous=globalThis.Audio,originalRevoke=URL.revokeObjectURL;const order=[],urls=[];URL.revokeObjectURL=url=>{urls.push(url);originalRevoke.call(URL,url)};
 globalThis.Audio=class {async play(){queueMicrotask(()=>this.onended?.())}pause(){}set src(v){}};
 try{await playFairAudio([{text:'primero',blob:audio()},{text:'último',blob:audio()}],new AbortController().signal,(_,text)=>order.push(text));assert.deepEqual(order,['primero','último']);
 const ctl=new AbortController();await assert.rejects(playFairAudio([{text:'a',blob:audio()}],ctl.signal,()=>ctl.abort()),{name:'AbortError'});
 assert.equal(urls.length,3);assert.equal(new Set(urls).size,3);
 }finally{globalThis.Audio=previous;URL.revokeObjectURL=originalRevoke}
});
test('welcome renderer cannot mount microphone or speech-recognition code',()=>{
 const src=readFileSync('components/SuuFairNarrator.tsx','utf8');assert.doesNotMatch(src,/useMicrophoneInput|useDellSTT|getUserMedia|SpeechRecognition|\.record\(/);
 const parent=readFileSync('components/SuuFairMode.tsx','utf8');assert.match(parent,/<SuuFairNarrator/);assert.doesNotMatch(parent,/announce\("goodbye"\)/);
});

test('automatic voice can prepare without Piper, while explicit device-only stays device-only',()=>{
 assert.equal(fairRecordingVoice(false,'browser:preferred'),'es-MX-DaliaNeural');
 assert.equal(fairRecordingVoice(true,'browser:preferred'),'piper-dell-configured');
 assert.equal(fairRecordingVoice(false,'browser:auto'),null);
 assert.equal(fairRecordingVoice(true,'browser:auto'),null);
 assert.equal(fairRecordingVoice(false,'piper:daniela'),null);
 assert.equal(fairRecordingVoice(false,'es-ES-ElviraNeural'),'es-ES-ElviraNeural');
});
