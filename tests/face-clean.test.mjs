import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const shader=readFileSync('lib/face-point-shader.ts','utf8');
test('custom shader does not redeclare injected color and uses surface normals',()=>{assert.ok(!shader.includes('attribute vec3 color;'));assert.ok(shader.includes('normalMatrix*objectNormal'));assert.ok(!shader.includes('THREE.AdditiveBlending'))});
test('anatomical GLB is self-contained with finite geometry and valid indices',()=>{
 const b=readFileSync('public/models/suu-face-anatomical.glb');assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(8),b.length);
 const jsonLength=b.readUInt32LE(12),j=JSON.parse(b.toString('utf8',20,20+jsonLength));
 assert.ok(j.buffers.every(b=>!b.uri));assert.ok(j.asset.generator.includes('MakeHuman'));
 const base=28+jsonLength,positions=j.accessors[0],indices=j.accessors[3];assert.ok(positions.count>50000);
 for(let i=0;i<positions.count*3;i++)assert.ok(Number.isFinite(b.readFloatLE(base+j.bufferViews[0].byteOffset+i*4)));
 for(let i=0;i<indices.count;i++)assert.ok(b.readUInt32LE(base+j.bufferViews[3].byteOffset+i*4)<positions.count);
});
