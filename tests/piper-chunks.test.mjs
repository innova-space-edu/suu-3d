import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitPiperSpeech} from '../lib/piper-chunks.mjs';

test('Piper starts with a short phrase, with bounded later phrases',()=>{
 const text='Hola, soy SUU. '+('Puedo ayudarte con proyectos, ciencias y matemáticas. ').repeat(15);
 const parts=splitPiperSpeech(text);
 assert.ok(parts.length>=2);
 assert.ok(parts[0].length<=90);
 assert.ok(parts.slice(1).every(p=>p.length<=150));
 assert.ok(parts.every(p=>p.length>0));
 assert.ok(parts.join(' ').length>=630);
});

test('a complete short opening sentence starts before the next sentence',()=>{
 const text='Hola, soy SUU y estoy lista. '+('Podemos investigar las energías renovables. ').repeat(8);
 const parts=splitPiperSpeech(text);
 assert.equal(parts[0],'Hola, soy SUU y estoy lista.');
 assert.equal(parts.join(' '),text.trim());
});

test('Piper speech preserves text boundaries and punctuation',()=>{
 const text='Hola, soy SUU. Puedo ayudarte con tareas, proyectos, matemáticas y ciencias. También puedo presentar una exposición para tu curso.';
 const parts=splitPiperSpeech(text);
 assert.equal(parts.join(' '),text);
});

test('Piper does not create empty parts, and respects backend 700-character limit',()=>{
 assert.deepEqual(splitPiperSpeech(''),[]);
 assert.deepEqual(splitPiperSpeech('  Hola.  '),['Hola.']);
 const parts=splitPiperSpeech('A'.repeat(1200));
 assert.equal(parts.join('').length,700);
 assert.ok(parts.length<10);
});
