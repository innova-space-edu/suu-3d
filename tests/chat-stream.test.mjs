import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const moduleUrl=(file,replacements={})=>{
 let js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [from,to] of Object.entries(replacements))js=js.replaceAll(from,to);
 return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
};
const client=moduleUrl('lib/piper-client.ts');
const playback=moduleUrl('lib/piper-playback.ts',{'@/lib/piper-client':client,'@/lib/piper-chunks.mjs':pathToFileURL(process.cwd()+'/lib/piper-chunks.mjs').href});
const speech=moduleUrl('lib/speech-text.ts');
const {SpeechBuffer,PhraseQueue,requestStreamedChat,streamPiperReply}=await import(moduleUrl('lib/chat-stream.ts',{'@/lib/speech-text':speech,'@/lib/piper-playback':playback}));
const delta=text=>JSON.stringify({type:'delta',text})+'\n';
const done=reply=>JSON.stringify({type:'done',reply,provider:'Dell',fallbackUsed:false})+'\n';
const encoder=new TextEncoder();

test('incremental splitter waits for a boundary, preserves words and bounds speech',()=>{
 const parts=[],splitter=new SpeechBuffer(p=>parts.push(p));
 splitter.add('Hola, soy SUU y estoy li');assert.equal(parts.length,0);
 splitter.add('sta. ');assert.deepEqual(parts,['Hola, soy Súu y estoy lista.']);
 splitter.add('Podemos investigar energía solar y cuidar el medio ambiente.');splitter.finish();
 assert.equal(parts.join(' '),'Hola, soy Súu y estoy lista. Podemos investigar energía solar y cuidar el medio ambiente.');
 const bounded=[],limited=new SpeechBuffer(p=>bounded.push(p));
 limited.add('A'.repeat(12000));limited.finish();
 assert.equal(bounded.join('').length,700);
 assert.ok(bounded.every(p=>p.length<=150));
});

test('queue failure wakes an idle consumer and discards queued text',async()=>{
 const queue=new PhraseQueue(),iterator=queue[Symbol.asyncIterator]();
 const waiting=iterator.next();queue.fail(new Error('cancelled'));
 await assert.rejects(waiting,/cancelled/);
 queue.push('never spoken');assert.deepEqual(await iterator.next(),{done:true,value:undefined});
});

test('client accepts fragmented UTF-8 and rejects a truncated response',async()=>{
 const original=globalThis.fetch;
 try{
  const reply='¡Sí, energía!',bytes=encoder.encode(delta(reply)+done(reply));
  globalThis.fetch=async()=>new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close()}}),{headers:{'content-type':'application/x-ndjson'}});
  let visible='';const result=await requestStreamedChat([], 'general',new AbortController().signal,t=>visible+=t);
  assert.equal(result.reply,reply);assert.equal(visible,reply);
  globalThis.fetch=async()=>new Response(delta('Parcial'),{headers:{'content-type':'application/x-ndjson'}});
  await assert.rejects(requestStreamedChat([],'general',new AbortController().signal,()=>{}),/interrumpió/);
 }finally{globalThis.fetch=original}
});

test('full flow starts audio before Qwen finishes, orders clips and releases URLs',async()=>{
 const originalFetch=globalThis.fetch,originalAudio=globalThis.Audio,info=console.info,revoke=URL.revokeObjectURL;
 let controller,chatFinished=false,playing=0,revoked=0;
 const order=[],texts=[];
 const first='Hola, soy SUU y estoy lista. ',last='Podemos estudiar energía solar.';
 class Audio extends EventTarget{
  paused=true;
  async play(){
   this.paused=false;this.dispatchEvent(new Event('playing'));this.dispatchEvent(new Event('play'));
   if(++playing===1){
    assert.equal(chatFinished,false);order.push('first-audio');
    controller.enqueue(encoder.encode(delta(last)+done(first+last)));controller.close();
   }
   queueMicrotask(()=>{this.paused=true;this.dispatchEvent(new Event('ended'))});
  }
  pause(){this.paused=true}
 }
 try{
  globalThis.Audio=Audio;console.info=()=>{};
  URL.revokeObjectURL=url=>{revoked++;revoke(url)};
  globalThis.fetch=async(url,options)=>{
   if(url==='/api/chat')return new Response(new ReadableStream({start(c){controller=c;c.enqueue(encoder.encode(delta(first)))}}),{headers:{'content-type':'application/x-ndjson'}});
   assert.equal(url,'/api/piper');texts.push(JSON.parse(options.body).text);
   return new Response(new Uint8Array(120),{headers:{'content-type':'audio/wav'}});
  };
  const answer=await streamPiperReply({messages:[],domain:'general',locale:'es-CL',signal:new AbortController().signal,
   onText:()=>{},onResult:()=>{chatFinished=true;order.push('chat-done')},onClip:()=>{}});
  assert.deepEqual(order,['first-audio','chat-done']);assert.equal(answer.spoken,true);assert.equal(answer.voiceError,undefined);
  assert.deepEqual(texts,['Hola, soy Súu y estoy lista.',last]);assert.equal(playing,2);assert.equal(revoked,2);
 }finally{globalThis.fetch=originalFetch;globalThis.Audio=originalAudio;console.info=info;URL.revokeObjectURL=revoke}
});

test('cancellation while awaiting more Qwen text stops audio and the pending reader',async()=>{
 const originalFetch=globalThis.fetch,originalAudio=globalThis.Audio;
 const ctl=new AbortController();let paused=false;
 class Audio extends EventTarget{
  async play(){this.dispatchEvent(new Event('playing'));ctl.abort()}
  pause(){paused=true}
 }
 try{
  globalThis.Audio=Audio;
  globalThis.fetch=async(url,options)=>{
   if(url==='/api/piper')return new Response(new Uint8Array(120),{headers:{'content-type':'audio/wav'}});
   return new Response(new ReadableStream({start(c){c.enqueue(encoder.encode(delta('Hola, soy SUU y estoy lista. ')));options.signal.addEventListener('abort',()=>c.error(new Error('cancelled')),{once:true})}}),{headers:{'content-type':'application/x-ndjson'}});
  };
  await assert.rejects(streamPiperReply({messages:[],domain:'general',locale:'es-CL',signal:ctl.signal,onText:()=>{},onResult:()=>assert.fail('must not complete'),onClip:()=>{}}),/cancelled/);
  assert.ok(paused);
 }finally{globalThis.fetch=originalFetch;globalThis.Audio=originalAudio}
});

test('first voice fragment is ready at 60 characters without waiting for a long sentence',()=>{
 const parts=[],splitter=new SpeechBuffer(p=>parts.push(p));
 splitter.add('Los planetas orbitan alrededor del Sol por la atracción gravitatoria');
 assert.equal(parts.length,1);assert.ok(parts[0].length<=60);
 assert.equal(parts[0],'Los planetas orbitan alrededor del Sol por la atracción');
 splitter.finish();assert.equal(parts.join(' '),'Los planetas orbitan alrededor del Sol por la atracción gravitatoria');
});
