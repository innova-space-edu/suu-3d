import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const shader=readFileSync('lib/face-point-shader.ts','utf8');
test('custom shader does not redeclare injected color and uses surface normals',()=>{assert.ok(!shader.includes('attribute vec3 color;'));assert.ok(shader.includes('normalMatrix*normal'));assert.ok(!shader.includes('THREE.AdditiveBlending'))});
test('source GLB contains complete indexed surface without external dependencies',()=>{
 const b=readFileSync('public/models/suu-face-v4.glb');assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(8),b.length);const j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));assert.equal(j.accessors[1].count,91392);assert.equal(j.accessors[0].count,546048);assert.ok(j.buffers.every(b=>!b.uri));
});
