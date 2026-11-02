import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/microphone.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {disableNoiseReduction,microphoneConstraints,supportsRecognitionTrack,startMicrophoneRecognition,SpeechEndpoint,validMicrophonePreferences}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const ua='Mozilla/5.0 (Windows NT 10.0) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0';
function input(){let stopped=0;const track={kind:'audio',readyState:'live',getSettings:()=>({noiseSuppression:true}),stop:()=>stopped++};return {track,stream:{getTracks:()=>[track],getAudioTracks:()=>[track]},stopped:()=>stopped}}
test('standard capture avoids strong isolation and gain pumping',()=>{
 assert.deepEqual(microphoneConstraints(true),{noiseSuppression:true,echoCancellation:true,autoGainControl:false,voiceIsolation:false,channelCount:1});
 assert.equal(microphoneConstraints(false).noiseSuppression,false);
 assert.equal(supportsRecognitionTrack(ua),true);assert.equal(supportsRecognitionTrack(ua+' Mobile Android'),false);assert.equal(supportsRecognitionTrack('Safari/605.1'),false);
});
test('processed track actually reaches recognition and canceled capture releases it',async()=>{
 const mic=input(),received=[];let constraints;
 const result=await startMicrophoneRecognition({start:t=>received.push(t)},true,{userAgent:ua,capture:async c=>{constraints=c;return mic.stream}},()=>false);
 assert.equal(received[0],mic.track);assert.equal(result.mode,'standard');assert.equal(constraints.noiseSuppression,true);
 let cancel=false;const other=input();const ignored=await startMicrophoneRecognition({start:()=>assert.fail('canceled')},true,{userAgent:ua,capture:async()=>{cancel=true;return other.stream}},()=>cancel);
 assert.equal(ignored,null);assert.equal(other.stopped(),1);
});
test('unsupported browsers use native recognition without duplicate microphone capture',async()=>{
 let started=false;const result=await startMicrophoneRecognition({start:t=>{assert.equal(t,undefined);started=true}},true,{userAgent:'Safari/605.1',capture:async()=>assert.fail('capture')},()=>false);
 assert.ok(started);assert.equal(result.mode,'browser');
});
test('explicit unsupported track input releases capture before native fallback',async()=>{
 const mic=input(),calls=[];
 const result=await startMicrophoneRecognition({start:t=>{calls.push(t);if(t)throw new TypeError('unsupported')}},true,{userAgent:ua,capture:async()=>mic.stream},()=>false);
 assert.equal(result.mode,'browser');assert.equal(mic.stopped(),1);assert.deepEqual(calls,[mic.track,undefined]);
});

test('disabling noise suppression verifies the result instead of trusting an ignored constraint',async()=>{
 let constraints;
 await disableNoiseReduction({applyConstraints:async c=>{constraints=c},getSettings:()=>({noiseSuppression:false})});
 assert.deepEqual(constraints,{noiseSuppression:false});
 await assert.rejects(()=>disableNoiseReduction({applyConstraints:async()=>{},getSettings:()=>({noiseSuppression:true})}));
 await assert.rejects(()=>disableNoiseReduction({applyConstraints:async()=>{throw Error('unsupported')},getSettings:()=>({noiseSuppression:true})}));
});

test('external microphone and opt-in gain reach the captured recognition track',async()=>{
 const mic=input();let captured;
 await startMicrophoneRecognition({start:t=>assert.equal(t,mic.track)},false,{userAgent:ua,capture:async c=>{captured=c;return mic.stream}},()=>false,{deviceId:'external-usb',autoGainControl:true});
 assert.deepEqual(captured.deviceId,{exact:'external-usb'});assert.equal(captured.autoGainControl,true);assert.equal(captured.echoCancellation,true);assert.equal(captured.channelCount,1);assert.equal(captured.voiceIsolation,false);
 assert.ok(validMicrophonePreferences({deviceId:'usb',autoGainControl:true}));assert.equal(validMicrophonePreferences({autoGainControl:'yes'}),false);assert.equal(validMicrophonePreferences({deviceId:'x'.repeat(513)}),false);
});
test('quick endpoint ends after 600 ms of silence, normal permits longer pauses, noise spikes do not start speech',()=>{
 const quick=new SpeechEndpoint(true),normal=new SpeechEndpoint();
 for(const endpoint of [quick,normal]){assert.equal(endpoint.update(.03,90),false);assert.equal(endpoint.update(.03,180),false);assert.equal(endpoint.voiceSeen,true)}
 assert.equal(quick.update(0,800),true);assert.equal(normal.update(0,800),false);assert.equal(normal.update(0,1400),true);
 const spike=new SpeechEndpoint(true);spike.update(.04,90);assert.equal(spike.update(0,1000),false);assert.equal(spike.voiceSeen,false);
});
