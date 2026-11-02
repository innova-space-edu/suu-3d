import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const library=await load('lib/audio-library.ts');
test('same text voice and language replay without resynthesis; changed voice generates separately',async()=>{
 let count=0;const generate=async()=>{count++;return {blob:new Blob([new Uint8Array(120)],{type:'audio/wav'}),words:[]}};
 const signal=new AbortController().signal;
 await library.cachedRecording('Hola','Dalia','es-MX','fair',signal,generate);
 const hit=await library.cachedRecording('Hola','Dalia','es-MX','conversation',signal,generate);
 assert.equal(hit.cached,true);assert.equal(count,1);
 await library.cachedRecording('Hola','Elvira','es-MX','fair',signal,generate);assert.equal(count,2);
});
test('conversation cache separates history and response style',async()=>{
 const a=[{role:'user',content:'¿Qué es?'}];
 assert.notEqual(await library.responseLibraryKey(a,'fair',true),await library.responseLibraryKey(a,'fair',false));
 assert.notEqual(await library.responseLibraryKey(a,'fair',true),await library.responseLibraryKey([{role:'assistant',content:'Marte'},...a],'fair',true));
});
test('aborted generation never starts a provider request',async()=>{
 const c=new AbortController();c.abort();let called=false;
 await assert.rejects(library.cachedRecording('Cancelado','Dalia','es-MX','fair',c.signal,async()=>{called=true;throw Error()}));assert.equal(called,false);
});
const tts=await load('lib/extra-tts.ts');
test('PCM is wrapped in a valid mono 24k WAV header',()=>{
 const wav=tts.pcmWav(new Uint8Array(120));assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),24000);assert.equal(wav.readUInt32LE(40),120);assert.throws(()=>tts.pcmWav(new Uint8Array(3)));
});
test('Azure escapes SSML text and WAV and PCM adapters do not mix formats',async()=>{
 const old=globalThis.fetch;process.env.AZURE_SPEECH_KEY='test-key';process.env.AZURE_SPEECH_REGION='eastus';
 globalThis.fetch=async(url,init)=>{assert.equal(url,'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');assert.ok(init.body.includes('A &amp; B &lt; C'));assert.equal(init.headers['Ocp-Apim-Subscription-Key'],'test-key');return new Response(new Uint8Array(120),{headers:{'Content-Type':'audio/mpeg'}})};
 try{const result=await tts.extraTTS('A & B < C','azure:es-MX-DaliaNeural','es-MX',new AbortController().signal);assert.equal(result.type,'audio/mpeg')}finally{globalThis.fetch=old;delete process.env.AZURE_SPEECH_KEY;delete process.env.AZURE_SPEECH_REGION}
});
