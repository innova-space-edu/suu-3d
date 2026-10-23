import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/lip-sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {wordTimings,estimatedWords,buildLipCues,lipPoseAt,VISEMES}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('provider ticks become measured word windows and pauses close the mouth',()=>{
 const words=wordTimings([{text:'mamá',offset:1e7,duration:5e6},{text:'papá',offset:2e7,duration:5e6}]);
 assert.equal(words[0].start,1);assert.equal(words[0].end,1.5);
 const cues=buildLipCues(words);assert.equal(cues[0].shape,'MBP');assert.equal(cues[1].shape,'A');
 assert.equal(lipPoseAt(cues,1).jaw,0);assert.ok(lipPoseAt(cues,1.15).jaw>0);assert.equal(lipPoseAt(cues,1.8).jaw,0);assert.equal(lipPoseAt(cues,3).jaw,0);
 assert.ok(cues.every(c=>c.start>=1&&c.end<=2.5&&c.end>c.start));
});
test('vowels have distinct shapes and closures override opening',()=>{
 assert.ok(VISEMES.O.pucker>VISEMES.E.wide);assert.ok(VISEMES.I.wide>VISEMES.A.wide);
 assert.deepEqual(VISEMES.MBP,{jaw:0,pucker:0,wide:0});
 assert.equal(buildLipCues([{text:'qué',start:0,end:1}]).some(c=>c.shape==='U'),false);
});
test('estimated fallback stays inside actual duration and malformed timing is ignored',()=>{
 const words=estimatedWords('Hola, mamá. ¿Cómo estás?',3),cues=buildLipCues(words);
 assert.ok(words.length===4&&cues.length>0);assert.ok(cues.every(c=>c.start>=0&&c.end<=3.000001));
 assert.deepEqual(buildLipCues([{text:'bad',start:1,end:0}]),[]);
 assert.deepEqual(estimatedWords('hola',NaN),[]);assert.equal(lipPoseAt(cues,Infinity).jaw,0);
});
