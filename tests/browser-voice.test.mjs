import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/browser-voice.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {selectBrowserVoice:select}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('device voice prioritizes installed voices while respecting an explicit voice and language',()=>{
 const online={voiceURI:'online',lang:'es-CL',localService:false},local={voiceURI:'local',lang:'es-ES',localService:true},english={voiceURI:'en',lang:'en-US',localService:true};
 assert.equal(select([online,local,english],'browser:auto','es-CL'),local);
 assert.equal(select([online,local],'browser:online','es-CL'),online);
 assert.equal(select([english],'browser:auto','es-CL'),null);
 assert.equal(select([online],'browser:auto','es-CL'),online);
});
