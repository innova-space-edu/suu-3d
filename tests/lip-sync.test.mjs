import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/lip-sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {wordTimings,estimatedWords,buildLipCues,buildCharacterLipCues,buildPhonemeLipCues,phoneViseme,lipCueAt,lipPoseAt,VISEMES}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
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

test("measured character alignment wins over estimated word subdivisions",()=>{
 const chars=[
  {text:"m",start:0,end:.10},
  {text:"a",start:.10,end:.37},
  {text:" ",start:.37,end:.41},
  {text:"o",start:.41,end:.72}
 ];
 const cues=buildCharacterLipCues(chars);
 assert.equal(cues.length,3);
 assert.equal(cues[0].shape,"MBP");
 assert.equal(cues[1].shape,"A");
 assert.equal(cues[2].shape,"O");
 assert.equal(lipCueAt(cues,.4),undefined,"silence remains neutral");
 assert.equal(lipCueAt(cues,.5)?.shape,"O");
 assert.equal(lipPoseAt(cues,.4).jaw,0);
});

test("trusted acoustic phone timestamps override grapheme timing and retain silence",()=>{
 const phonemes=[{phone:"m",start:0,end:.13},{phone:"a",start:.13,end:.31},{phone:"sil",start:.31,end:.42},{phone:"t",start:.42,end:.54},{phone:"o",start:.54,end:.75}];
 const cues=buildPhonemeLipCues(phonemes);
 assert.equal(cues.length,5);
 assert.equal(cues[0].shape,"MBP");
 assert.equal(cues[1].shape,"A");
 assert.equal(cues[2].shape,"REST");
 assert.equal(lipCueAt(cues,.60)?.phone,"o");
 assert.equal(phoneViseme("ɾ"),"C");
 assert.equal(phoneViseme("e"),"E");
 assert.equal(lipPoseAt(cues,1).jaw,0);
});
