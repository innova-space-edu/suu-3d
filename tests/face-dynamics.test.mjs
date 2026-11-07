import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

async function loadTs(source){
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
}
const rig=readFileSync("lib/face-rig.ts","utf8");
const channels=JSON.parse(rig.match(/FACE_CHANNELS=(\[[^\]]+\])/)[1]);
const fakeRig="data:text/javascript;base64,"+Buffer.from("export const FACE_CHANNELS="+JSON.stringify(channels)+";").toString("base64");
const physicsSource=readFileSync("lib/face-physics.ts","utf8").replace('from "./face-rig"', 'from "'+fakeRig+'"');
const {makeFaceDynamics,advanceFaceDynamics,faceDynamicsWeights,constrainedPose}=await loadTs(physicsSource);
const {emotionForSpeech}=await loadTs(readFileSync("lib/face-emotion.ts","utf8"));

test("mass-spring actuators track targets without overshoot or NaN",()=>{
 const state=makeFaceDynamics();
 for(let frame=0;frame<180;frame++)advanceFaceDynamics(state,{jaw:.8,smile:.5,browUp:.3},1/60);
 const weights=faceDynamicsWeights(state);
 assert.ok(Math.abs(weights[0]-.8)<.03);
 assert.ok(Math.abs(weights[1]-.5)<.03);
 assert.ok(weights.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 for(let frame=0;frame<90;frame++)advanceFaceDynamics(state,{},1/60);
 assert.ok(faceDynamicsWeights(state)[0]<.03,"jaw returns to rest");
});
test("actuators resist unstable frame times, antagonistic lip commands",()=>{
 const state=makeFaceDynamics();
 advanceFaceDynamics(state,{jaw:1,wide:1,pucker:1},1);
 assert.ok(faceDynamicsWeights(state).every(v=>Number.isFinite(v)&&v<=1&&v>=0));
 const pose=constrainedPose({wide:1,pucker:1,smile:1,frown:1});
 assert.ok(pose.wide<1&&pose.pucker<1&&pose.smile<1&&pose.frown<1);
});
test("autonomous affect is bounded, neutral when ambiguous, ignores simple negation",()=>{
 assert.equal(emotionForSpeech("Hola, buenos días").emotion,"neutral");
 assert.equal(emotionForSpeech("¡Excelente trabajo! Me alegra mucho.").emotion,"joy");
 assert.equal(emotionForSpeech("No estoy feliz").emotion,"neutral");
 assert.equal(emotionForSpeech("¡Cuidado! Existe un peligro.").emotion,"concern");
 for(const input of ["¡Qué bien!","Te explico cómo funciona","Lo lamento","Precaución","Conseguimos resolverlo"]){
  const result=emotionForSpeech(input);
  assert.ok(result.confidence<=1);
  assert.ok(Object.values(result.pose).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 }
});
