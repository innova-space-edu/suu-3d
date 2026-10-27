import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/provider-router.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {chatWithFallback,providerStatus}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
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
