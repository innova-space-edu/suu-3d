import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync('app/api/piper/route.ts','utf8');
const server=readFileSync('deploy/dell-tts/service.py','utf8');
const compose=readFileSync('deploy/dell-tts/compose.yaml','utf8');
const consoleUi=readFileSync('components/SuuConsole.tsx','utf8');
const voiceUi=readFileSync('components/SuuVoiceMode.tsx','utf8');
const playback=readFileSync('lib/piper-playback.ts','utf8');

test('Piper endpoint enforces SUU sessions, origin and request throttling',()=>{
 for(const term of ['await authorized()','originAllowed(req)','throttle("piper:"','piperConfigured()','CF-Access-Client-Id','CF-Access-Client-Secret','Authorization:'])
  assert.ok(api.includes(term),term);
 assert.ok(!api.includes('NEXT_PUBLIC_SUU_TTS_API_TOKEN'));
});

test('backend requires a secret, bounds synthesis and never logs input text',()=>{
 for(const term of ['compare_digest','MAX_TEXT = 700','MAX_AUDIO_BYTES = 3_000_000','LOCK.acquire(blocking=False)','await asyncio.to_thread','Cache-Control'])
  assert.ok(server.includes(term),term);
 assert.ok(!server.includes('print(text)'));
});

test('Piper is isolated with a private loopback port and read-only model',()=>{
 for(const term of ['127.0.0.1:8096:8096','read_only: true','cap_drop: [ALL]','no-new-privileges:true','./models:/voices:ro','portal_default'])
  assert.ok(compose.includes(term),term);
 assert.ok(!compose.includes('/var/run/docker.sock'));
});

test('both chat and hands-free voice use Piper with lip cues and fallback',()=>{
 for(const ui of [consoleUi,voiceUi]){
  assert.ok(ui.includes('playPiperSpeech'), 'Piper segment playback missing');
  assert.ok(ui.includes('lips.audio(player'), 'lip sync missing');
  assert.ok(ui.includes('selectBrowserVoice'), 'local fallback missing');
  assert.ok(ui.includes('ttsLocal'), 'availability gating missing');
 }
});

test('Piper segments synthesize ahead while audio plays and respect cancellation',()=>{
 for(const term of ['requestPiperAudio','playPiperPhrases','const next=prepare()','const next=','await playClip(player,signal)','signal.addEventListener("abort"'])
  assert.ok(playback.includes(term),term);
 assert.ok(api.includes('"Server-Timing"'), 'Piper timing header missing');
});
