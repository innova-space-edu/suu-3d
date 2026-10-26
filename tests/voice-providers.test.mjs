import {test} from "node:test";import {strict as assert} from "node:assert";import {readFileSync} from "node:fs";
test("EDUAI six Audio Lab voices and extended narrator voices",()=>{const code=readFileSync("lib/voice-catalog.ts","utf8");for(const name of ["Catalina","Lorenzo","Alvaro","Elvira","Jorge","Dalia","Alonso","Paloma"])assert.ok(code.includes(name+"Neural"),name)});
test("voice cloning maintains original EDUAI protection",()=>{const code=readFileSync("docs/VOICE_PROVIDERS.md","utf8");assert.ok(code.includes("AAL2"));assert.ok(code.includes("No se copian"))});
test("provider priority Dell -> Groq -> SambaNova -> OpenRouter -> Gemini",()=>{
 const code=readFileSync("lib/provider-router.ts","utf8");
 const names=["dell","groq","sambanova","openrouter","gemini"];
 const positions=names.map(id=>{
  const match=new RegExp('id:\\s*["\\']'+id+'["\\']').exec(code);
  assert.ok(match,"Falta proveedor "+id);
  return match.index;
 });
 for(let index=1;index<positions.length;index++)assert.ok(positions[index-1]<positions[index],names[index]+" fuera de orden");
});
