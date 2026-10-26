import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/fair-knowledge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {FAIR_KNOWLEDGE,fairKnowledgeAnswer:answer}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const ask=content=>answer([{role:'user',content}]);
test('all 50 organizer questions and curated variants retrieve their supplied answer',()=>{
 assert.equal(FAIR_KNOWLEDGE.length,50);
 for(const entry of FAIR_KNOWLEDGE)for(const q of [entry.question,...entry.variants])assert.equal(ask(q),entry.answer,q);
});
test('normalization tolerates accents, punctuation and case without mixing adjacent intents',()=>{
 assert.equal(ask('DONDE ESTA ALMA!!!'),FAIR_KNOWLEDGE[22].answer);
 assert.equal(ask('Por favor, qué partes tiene un telescopio'),FAIR_KNOWLEDGE[25].answer);
 assert.notEqual(ask('Qué es ALMA'),ask('Dónde está ALMA'));
});
test('unclear, unsupported and medical queries are not guessed from a nearby FAQ',()=>{
 for(const q of ['¿Quién lo hizo?','¿Cuáles son?','Háblame de astronomía','Qué materiales tiene un robot de Marte','Qué dosis de medicamento sirve para el estrés','Qué es ALMA y cómo programo un robot','Cómo funciona'])assert.equal(ask(q),null,q);
});
test('FAQ preserves uncertainty and answers from source instead of inventing results',()=>{
 assert.match(ask('Los paneles solares alcanzan para todo el colegio'),/todavía no se ha comprobado/);
 assert.match(ask('Qué aprendemos en la Expo Ciencias'),/reconocer las limitaciones/);
});
