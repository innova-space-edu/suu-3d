import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/provider-router.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {chatWithFallback,providerStatus,readChatCompletionStream}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
async function isolated(fn){
 const saved={...process.env},fetch=globalThis.fetch,warn=console.warn;
 for(const key of Object.keys(process.env))if(/GROQ|SAMBANOVA|OPENROUTER|GEMINI|SUU_LLM|SUU_DELL/.test(key))delete process.env[key];
 console.warn=()=>{};
 try{await fn()}finally{process.env=saved;globalThis.fetch=fetch;console.warn=warn}
}
test('all four configured providers participate in fallback',()=>isolated(async()=>{
 Object.assign(process.env,{GROQ_API_KEY:'test-groq',SAMBANOVA_API_KEY_SUU:'test-sam',SAMBANOVA_MODEL_SUU:'test-model',OPENROUTER_API_KEY_SUU:'test-router',OPENROUTER_MODEL_SUU:'test-model',GEMINI_API_KEY_SUU:'test-gemini'});
 assert.equal(providerStatus().filter(p=>p.configured).length,4);
 const urls=[];globalThis.fetch=async url=>{urls.push(url);return urls.length<4?new Response('{}',{status:429}):Response.json({choices:[{message:{content:'respuesta'}}]})};
 const result=await chatWithFallback([{role:'user',content:'hola'}],'test');
 assert.equal(result.provider,'Gemini');assert.equal(result.fallbackUsed,true);assert.equal(urls.length,4);
}));
test('failure describes provider and status without exposing upstream body or credential',()=>isolated(async()=>{
 process.env.GROQ_API_KEY='private-test-key';
 globalThis.fetch=async()=>new Response('private-test-key internal error',{status:401});
 await assert.rejects(chatWithFallback([{role:'user',content:'hola'}],'test'),e=>e.message.includes('Groq')&&e.message.includes('HTTP 401')&&!e.message.includes('private-test-key'));
}));
test('legacy configuration still routes through the approved provider',()=>isolated(async()=>{
 Object.assign(process.env,{SUU_LLM_API_KEY:'legacy-test',SUU_LLM_BASE_URL:'https://api.groq.com/openai/v1/',SUU_LLM_MODEL:'test-model'});
 assert.equal(providerStatus().find(p=>p.id==='groq').configured,true);
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:'ok'}}]});
 assert.equal((await chatWithFallback([{role:'user',content:'hola'}],'test')).provider,'Groq');
}));

test('Dell private API is primary and sends Cloudflare credentials only server-side',()=>isolated(async()=>{
 Object.assign(process.env,{
  SUU_DELL_API_BASE_URL:'https://private-ai.example/v1/',
  SUU_DELL_API_TOKEN:'test-dell-key',
  SUU_DELL_MODEL:'suu-local',
  SUU_DELL_CF_ACCESS_CLIENT_ID:'example-access-id',
  SUU_DELL_CF_ACCESS_CLIENT_SECRET:'example-access-secret',
  GROQ_API_KEY:'test-groq'
 });
 const calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url,headers:options.headers,body:JSON.parse(options.body)});
  return Response.json({choices:[{message:{content:'Hola desde Dell'}}]});
 };
 const result=await chatWithFallback([{role:'user',content:'hola'}],'test');
 assert.equal(result.provider,'Servidor Dell');
 assert.equal(result.fallbackUsed,false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://private-ai.example/v1/chat/completions');
 assert.equal(calls[0].headers.Authorization,'Bearer test-dell-key');
 assert.equal(calls[0].headers['CF-Access-Client-Id'],'example-access-id');
 assert.equal(calls[0].body.model,'suu-local');
 assert.equal(calls[0].body.max_tokens,96);
  assert.match(calls[0].body.messages[0].content,/máximo 45 palabras/);
 assert.equal(providerStatus().find(p=>p.id==='dell').configured,true);
}));
test('Dell CPU response stays capped while external fallback keeps full budget',()=>isolated(async()=>{
 Object.assign(process.env,{
   SUU_DELL_API_BASE_URL:'https://private-ai.example/v1',
   SUU_DELL_API_TOKEN:'dell-test',
   GROQ_API_KEY:'groq-test'
 });
 const calls=[];
 globalThis.fetch=async(url,options)=>{
   calls.push({url,body:JSON.parse(options.body)});
   return calls.length === 1
     ? new Response('{}',{status:502})
     : Response.json({choices:[{message:{content:'Respuesta de respaldo correcta'}}]});
 };
 const result=await chatWithFallback([{role:'user',content:'hola'}],'Eres SUU');
 assert.equal(result.provider,'Groq');
 assert.equal(calls[0].body.max_tokens,96);
 assert.match(calls[0].body.messages[0].content,/1-3 frases/);
 assert.equal(calls[1].body.max_tokens,900);
 assert.equal(calls[1].body.messages[0].content,'Eres SUU');
}));

test('Dell 502 immediately falls back to Groq without exposing credentials',()=>isolated(async()=>{
 Object.assign(process.env,{
  SUU_DELL_API_BASE_URL:'https://private-ai.example/v1',
  SUU_DELL_API_TOKEN:'test-dell-key',
  GROQ_API_KEY:'test-groq'
 });
 const urls=[];
 globalThis.fetch=async url=>{
  urls.push(url);
  return urls.length===1
    ? new Response('private upstream error',{status:502})
    : Response.json({choices:[{message:{content:'Respaldo correcto'}}]});
 };
 const result=await chatWithFallback([{role:'user',content:'hola'}],'test');
 assert.equal(result.provider,'Groq');
 assert.equal(result.fallbackUsed,true);
 assert.equal(urls.length,2);
}));
test('Dell requires HTTPS and a complete Cloudflare Access pair',()=>isolated(async()=>{
 Object.assign(process.env,{
  NODE_ENV:'production',
  SUU_DELL_API_BASE_URL:'http://server.example/v1',
  SUU_DELL_API_TOKEN:'test-key'
 });
 assert.equal(providerStatus().find(p=>p.id==='dell').configured,false);
 process.env.SUU_DELL_API_BASE_URL='https://server.example/v1';
 process.env.SUU_DELL_CF_ACCESS_CLIENT_ID='partial-id';
 assert.equal(providerStatus().find(p=>p.id==='dell').configured,false);
}));

const sseEvent=(content,finish=null)=>'data: '+JSON.stringify({choices:[{delta:{content},finish_reason:finish}]})+'\r\n\r\n';
test('SSE handles split UTF-8, CRLF and never emits private reasoning',async()=>{
 const text=': keepalive\r\n\r\ndata: '+JSON.stringify({choices:[{delta:{reasoning_content:'private thought'},finish_reason:null}]})+'\r\n\r\n'+sseEvent('¡Sí, energía!')+sseEvent('', 'stop')+'data: [DONE]\r\n\r\n';
 const bytes=new TextEncoder().encode(text);
 const stream=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close()}});
 const deltas=[];
 assert.equal(await readChatCompletionStream(new Response(stream),s=>deltas.push(s)),'¡Sí, energía!');
 assert.deepEqual(deltas,['¡Sí, energía!']);
});
test('SSE rejects EOF without a terminal event',async()=>{
 await assert.rejects(readChatCompletionStream(new Response(sseEvent('Hola')),()=>{}),/Incomplete/);
});
test('stream fallback is allowed before content but never after partial text',()=>isolated(async()=>{
 Object.assign(process.env,{GROQ_API_KEY:'test',SAMBANOVA_API_KEY_SUU:'test'});
 let calls=0;
 globalThis.fetch=async()=>{calls++;return calls===1?new Response('bad',{status:503}):new Response(sseEvent('Respuesta completa.','stop'),{headers:{'content-type':'text/event-stream'}})};
 const deltas=[];
 const result=await chatWithFallback([{role:'user',content:'hola'}],'test',{onDelta:t=>deltas.push(t)});
 assert.equal(result.fallbackUsed,true);assert.equal(calls,2);assert.deepEqual(deltas,['Respuesta completa.']);
 calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(sseEvent('Respuesta parcial.'),{headers:{'content-type':'text/event-stream'}})};
 await assert.rejects(chatWithFallback([{role:'user',content:'hola'}],'test',{onDelta:()=>{}}),/interrumpió/);
 assert.equal(calls,1);
}));
test('caller cancellation propagates upstream and prevents provider fallback',()=>isolated(async()=>{
 Object.assign(process.env,{GROQ_API_KEY:'test',SAMBANOVA_API_KEY_SUU:'test'});
 const ctl=new AbortController();let calls=0;
 globalThis.fetch=async(_url,options)=>{calls++;ctl.abort();assert.ok(options.signal.aborted);throw new Error('aborted')};
 await assert.rejects(chatWithFallback([{role:'user',content:'hola'}],'test',{signal:ctl.signal,onDelta:()=>{}}),/cancelada/);
 assert.equal(calls,1);
}));

test('Dell streaming extends only on progress and stays inside a 48s response budget',()=>isolated(async()=>{
 Object.assign(process.env,{SUU_DELL_API_BASE_URL:'https://private-ai.example/v1',SUU_DELL_API_TOKEN:'test'});
 const realNow=Date.now,realSet=globalThis.setTimeout,realClear=globalThis.clearTimeout;
 const delays=[];let time=0,step=0;
 Date.now=()=>time;
 globalThis.setTimeout=(_fn,ms)=>{delays.push(ms);return delays.length};
 globalThis.clearTimeout=()=>{};
 try{
  globalThis.fetch=async()=>new Response(new ReadableStream({pull(controller){
   if(step++===0){time=5000;controller.enqueue(new TextEncoder().encode(sseEvent('Primera frase. ')))}
   else {time=47000;controller.enqueue(new TextEncoder().encode(sseEvent('Final.','stop')));controller.close()}
  }},{highWaterMark:0}),{headers:{'content-type':'text/event-stream'}});
  const result=await chatWithFallback([{role:'user',content:'hola'}],'test',{onDelta:()=>{}});
  assert.equal(result.reply,'Primera frase. Final.');
  assert.equal(delays[0],22000);
  assert.ok(delays.includes(12000));
  assert.equal(delays.at(-1),1000);
 }finally{Date.now=realNow;globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear}
}));
