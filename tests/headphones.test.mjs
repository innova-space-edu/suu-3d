import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/headphones.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {hasDefaultHeadphones,readDefaultHeadphones}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const device=(label,deviceId='default',kind='audiooutput')=>({label,deviceId,kind});
test('standalone microphones and speakers never enable headphone-only noise reduction',()=>{
 assert.equal(hasDefaultHeadphones([device('USB Microphone','mic','audioinput'),device('Default - Speakers (Realtek)')]),false);
 assert.equal(hasDefaultHeadphones([device('Headset Microphone','default','audioinput')]),false);
});
test('a connected headset does not enable the filter when speakers remain the default',()=>{
 assert.equal(hasDefaultHeadphones([device('Headphones (USB)','usb'),device('Default - Speakers')]),false);
 assert.equal(hasDefaultHeadphones([device('Default - Speakers'),device('Communications - Headset','communications')]),false);
});
test('recognized default headphones enable the filter across common labels',()=>{
 for(const label of ['Default - Headphones (USB)','Predeterminado - Auriculares','Audífonos Bluetooth','AirPods Pro','Hands-Free AG Audio','Earbuds'])assert.equal(hasDefaultHeadphones([device(label)]),true,label);
});
test('missing, generic or ambiguous output information disables the filter',()=>{
 for(const list of [[],[device('')],[device('Default Audio Output')],[device('JBL Bluetooth Speaker')],[device('Speakers / Headphones (Realtek)')]]){
  // A combined driver name does not establish whether the headphone jack is in use.
  assert.equal(hasDefaultHeadphones(list),false);
 }
});
test('without a default alias only the first default-ordered output is considered',()=>{
 assert.equal(hasDefaultHeadphones([device('Headphones','first'),device('Speakers','second')]),true);
 assert.equal(hasDefaultHeadphones([device('Speakers','first'),device('Headphones','second')]),false);
});
test('enumeration errors and unavailable APIs fail closed without capturing audio',async()=>{
 assert.equal(await readDefaultHeadphones(),false);
 assert.equal(await readDefaultHeadphones({enumerateDevices:async()=>{throw Error('permission blocked')}}),false);
 assert.equal(await readDefaultHeadphones({enumerateDevices:async()=>[device('Default - Headphones')]}),true);
});
