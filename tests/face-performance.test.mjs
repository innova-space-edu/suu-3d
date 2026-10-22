import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const worker=readFileSync('public/face-v4-worker.js','utf8');
function generate(data){const messages=[];const self={postMessage:m=>messages.push(m)};vm.runInNewContext(worker,{self,Float32Array,Float64Array,Uint32Array,Math,Number,Error});self.onmessage({data:{type:'generate',...data}});return messages}
test('100k points lie on supplied triangle, normals are normalized, progressive chunks are bounded',()=>{
 const data={count:100000,position:new Float32Array([0,0,0,1,0,0,0,1,0]).buffer,normal:new Float32Array([0,0,1,0,0,1,0,0,1]).buffer,index:new Uint32Array([0,1,2]).buffer};
 const messages=generate(data),chunks=messages.filter(m=>m.type==='chunk');
 assert.equal(chunks.length,20);assert.equal(messages.at(-1).type,'complete');assert.equal(messages.at(-1).count,100000);
 let offset=0;
 for(const m of chunks){assert.equal(m.offset,offset);offset+=m.count;assert.ok(m.count<=5000);const p=new Float32Array(m.position),n=new Float32Array(m.normal);
 for(let j=0;j<p.length;j+=3){assert.ok(p[j]>=0&&p[j+1]>=0&&p[j]+p[j+1]<=1.000001);assert.ok(Math.abs(p[j+2]-.004)<1e-6);assert.equal(n[j+2],1)}}
});
test('degenerate mesh returns a visible error rather than looping',()=>{
 const m=generate({count:100000,position:new Float32Array(9).buffer,normal:new Float32Array(9).buffer,index:new Uint32Array([0,1,2]).buffer});assert.equal(m[0].type,'error');
});
