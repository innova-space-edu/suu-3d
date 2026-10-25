import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync('lib/face-rig.ts','utf8').replace('from "three"','from '+JSON.stringify(pathToFileURL(process.cwd()+'/node_modules/three/build/three.module.js').href));
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {facialDelta,poseWeights,FACE_CHANNELS}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('facial targets stay finite, bounded and keep rigid eyeballs unchanged',()=>{
 for(const k of FACE_CHANNELS){
  if(!k.startsWith('look'))assert.deepEqual(facialDelta(k,.3,.1,.8,true),[0,0,0]);
  for(let x=-1;x<=1;x+=.2)for(let y=-1.3;y<=1.3;y+=.2){const d=facialDelta(k,x,y,.9);assert.ok(d.every(Number.isFinite));assert.ok(Math.hypot(...d)<.4)}
 }
 assert.ok(facialDelta('jaw',0,-.62,1)[1]<-.05);
 assert.ok(facialDelta('pucker',.1,-.54,1)[2]>.03);
 assert.deepEqual(poseWeights({}),new Array(FACE_CHANNELS.length).fill(0));
 assert.equal(poseWeights({jaw:Infinity,smile:2})[0],0);assert.equal(poseWeights({smile:2})[1],1);
});
test('particle target displacement uses exactly its source triangle interpolation',()=>{
 const messages=[],scope={Float32Array,Float64Array,Uint32Array,Math,Number,Error,String,self:{postMessage:m=>messages.push(m)}};
 vm.runInNewContext(readFileSync('public/face-v4-worker.js','utf8'),scope);
 const position=new Float32Array([0,0,0,1,0,0,0,1,0]),normal=new Float32Array([0,0,1,0,0,1,0,0,1]);
 const delta=new Float32Array([0,0,0,0,0,1,0,0,2]);
 scope.self.onmessage({data:{type:'generate',count:30,position:position.buffer,normal:normal.buffer,index:new Uint32Array([0,1,2]).buffer,morphs:[delta.buffer],morphNormals:[new Float32Array(9).buffer]}});
 const chunk=messages.find(m=>m.type==='chunk');assert.ok(chunk);
 const p=new Float32Array(chunk.position),d=new Float32Array(chunk.morphs[0]);
 for(let i=0;i<30;i++){assert.ok(Math.abs(d[i*3+2]-p[i*3]-2*p[i*3+1])<1e-6);assert.equal(d[i*3],0)}
});

test('smile is continuous at the lip midline and serious engages eyelids and brows',()=>{
 const left=facialDelta('smile',-1e-6,-.54,1),right=facialDelta('smile',1e-6,-.54,1);
 assert.ok(Math.abs(right[0]-left[0])<1e-5,'no midline tear');
 assert.ok(facialDelta('smile',.22,-.53,1)[1]>facialDelta('smile',0,-.53,1)[1]+.015,'lift concentrated at corners');
 assert.ok(facialDelta('frown',.27,.32,.92)[1]<-.01,'brow lowers');
 assert.ok(facialDelta('frown',.295,.16,.79)[1]<-.004,'upper lid narrows');
 assert.ok(facialDelta('frown',.295,.04,.79)[1]>0,'lower lid rises');
});

test('attention rotates eyeballs around their center while skin stays fixed',()=>{
 for(const k of ['lookLeft','lookRight','lookUp','lookDown']){
  assert.deepEqual(facialDelta(k,.3,.1,.8,false),[0,0,0]);
  const p=[.29544,.099984,.826736],d=facialDelta(k,...p,true);
  assert.ok(Math.abs(Math.hypot(p[0]+d[0]-.29544,p[1]+d[1]-.099984,p[2]+d[2]-.686736)-.14)<1e-6);
 }
});
