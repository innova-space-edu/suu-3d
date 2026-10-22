import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const geometry=readFileSync("lib/face-v4-geometry.ts","utf8");
const client=readFileSync("components/SuuFaceV4Lab.tsx","utf8");
const worker=readFileSync("public/face-v4-worker.js","utf8");
test("eliminate contour raycasts",()=>{
 assert.ok(!geometry.includes("Raycaster"));
 assert.ok(!geometry.includes("intersectObject("));
 assert.ok(geometry.includes("surfaceZ("));
});
test("never create 100k points synchronously on main thread",()=>{
 assert.ok(!geometry.includes("sampler.sample("));
 assert.ok(!geometry.includes("MeshSurfaceSampler"));
 assert.ok(client.includes('new Worker("/face-v4-worker.js")'));
});
test("worker code parses as JavaScript",()=>{
 const r=spawnSync(process.execPath,["--check","public/face-v4-worker.js"],{encoding:"utf8"});
 assert.equal(r.status,0,r.stderr);
});
test("worker sends small chunks and client cancels correctly",()=>{
 assert.ok(worker.includes("CHUNK=5000"));
 assert.ok(worker.includes("pos.buffer,colors.buffer,imp.buffer"));
 assert.ok(client.includes("Math.min(count,received)"));
 assert.ok(client.includes("worker.terminate()"));
});
test("point buffer starts empty",()=>{
 assert.ok(geometry.includes("cloud.setDrawRange(0,0)"));
 assert.ok(geometry.includes("DynamicDrawUsage"));
});
