import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/provider-router.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {chatWithFallback,providerStatus}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
async function isolated(fn){
 const saved={...process.env},fetch=globalThis.fetch,warn=console.warn;
 for(const key of Object.keys(process.env))if(/GROQ|SAMBANOVA|OPENROUTER|GEMINI|SUU_LLM/.test(key))delete process.env[key];
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
