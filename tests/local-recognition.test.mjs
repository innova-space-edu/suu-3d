import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/local-recognition.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {preferOnDeviceRecognition}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('uses installed on-device recognition without downloading anything',async()=>{
 const calls=[];
 const ctor={available:async args=>{calls.push(args);return 'available'}};
 const recognizer={processLocally:false};
 assert.equal(await preferOnDeviceRecognition(ctor,recognizer,'es-CL'),true);
 assert.equal(recognizer.processLocally,true);
 assert.deepEqual(calls,[{langs:['es-CL'],processLocally:true}]);
});
test('cloud/browser fallback survives unsupported or missing local language packs',async()=>{
 for(const status of ['unavailable','downloadable','downloading']){
  const recognizer={processLocally:false};
  const ctor={available:async()=>status};
  assert.equal(await preferOnDeviceRecognition(ctor,recognizer,'es-CL'),false);
  assert.equal(recognizer.processLocally,false);
 }
 const legacyRecognizer={processLocally:false};
 assert.equal(await preferOnDeviceRecognition({},legacyRecognizer,'es-CL'),false);
 assert.equal(legacyRecognizer.processLocally,false);
});
test('recognition API errors never break the microphone fallback',async()=>{
 const recognition={processLocally:false};
 const ctor={available:async()=>{throw new Error('unsupported')}};
 assert.equal(await preferOnDeviceRecognition(ctor,recognition,'es-CL'),false);
 assert.equal(recognition.processLocally,false);
});
