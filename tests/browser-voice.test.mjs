import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/browser-voice.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {selectBrowserVoice:select}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('automatic speech is genuinely local, prefers Spanish and female local voices',()=>{
 const online={voiceURI:'online',lang:'es-CL',localService:false,name:'Voz en línea'};
 const local={voiceURI:'local',lang:'es-ES',localService:true,name:'Paula'};
 const localFemale={voiceURI:'female',lang:'es-ES',localService:true,name:'Elvira'};
 const english={voiceURI:'en',lang:'en-US',localService:true,name:'Alice'};
 assert.equal(select([online,local,localFemale,english],'browser:preferred','es-CL'),localFemale);
 assert.equal(select([online,local,localFemale,english],'browser:auto','es-CL'),localFemale);
 assert.equal(select([online,localFemale],'browser:online','es-CL'),online);
});

test('automatic does not silently choose cloud TTS or a different language',()=>{
 const online={voiceURI:'online',lang:'es-CL',localService:false};
 const english={voiceURI:'english',lang:'en-US',localService:true};
 assert.equal(select([online,english],'browser:preferred','es-CL'),null);
 assert.equal(select([online,english],'browser:auto','es-CL'),null);
 assert.equal(select([english],'browser:auto','es-CL'),null);
 assert.equal(select([online],'browser:online','es-CL'),online);
});

test('exact Spanish locale is prioritized over same-language alternatives',()=>{
 const cl={voiceURI:'cl',lang:'es-CL',localService:true,name:'Español Chile'};
 const es={voiceURI:'es',lang:'es-ES',localService:true,name:'Elvira'};
 assert.equal(select([es,cl],'browser:preferred','es-CL'),cl);
});
