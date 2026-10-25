import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
async function source(file){const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))}
const {attentionTarget}=await source('lib/face-attention.ts'),{spokenText}=await source('lib/speech-text.ts');
test('attention uses only position, stays bounded and returns centered gaze',()=>{
 assert.deepEqual(attentionTarget(.5,.45),{gazeX:0,gazeY:0});
 assert.ok(attentionTarget(.2,.45).gazeX>0);assert.ok(attentionTarget(.5,.7).gazeY<0);
 assert.deepEqual(attentionTarget(NaN,Infinity),{gazeX:0,gazeY:0});
 assert.equal(attentionTarget(-10,.45).gazeX,1);
});
test('SUU is spoken as a single accented word without rewriting unrelated text',()=>{
 assert.equal(spokenText('Soy SUU. Hola Suu, suu.'),'Soy Súu. Hola Súu, Súu.');
 assert.equal(spokenText('SUU_API_KEY y suuu'),'SUU_API_KEY y suuu');
});
