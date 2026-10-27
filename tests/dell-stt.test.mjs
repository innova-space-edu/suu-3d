import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const route=readFileSync('app/api/stt/route.ts','utf8');
const compose=readFileSync('deploy/dell-stt/compose.yaml','utf8');
const service=readFileSync('deploy/dell-stt/service.py','utf8');
const recorder=readFileSync('hooks/useDellSTT.ts','utf8');

test('STT API is protected by SUU session, origin and a per-user throttle',()=>{
 for(const name of ['originAllowed(req)','authorized()','throttle("stt:"','SUU_STT_API_TOKEN','CF-Access-Client-Id','CF-Access-Client-Secret'])
  assert.ok(route.includes(name),name);
 assert.ok(!route.includes('NEXT_PUBLIC_SUU_STT_API_TOKEN'));
});

test('audio has strict limits and is not included in logs',()=>{
 assert.match(route,/MAX_BYTES=2_500_000/);
 assert.match(service,/MAX_AUDIO_SECONDS = 17\.0/);
 assert.match(service,/MAX_AUDIO_BYTES = 2_500_000/);
 assert.match(service,/compare_digest/);
 assert.match(recorder,/MAX_RECORD_MS=15_000/);
 assert.doesNotMatch(service,/print\(.*text/);
 assert.doesNotMatch(service,/print\(.*audio/);
});

test('CPU service has no privileged Docker access and private localhost port',()=>{
 assert.match(compose,/cap_drop: \[ALL\]/);
 assert.match(compose,/no-new-privileges:true/);
 assert.match(compose,/read_only: true/);
 assert.match(compose,/127\.0\.0\.1:8095:8095/);
 assert.match(compose,/HF_HUB_OFFLINE: "1"/);
 assert.ok(!compose.includes('/var/run/docker.sock'));
});
