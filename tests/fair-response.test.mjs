import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const url=code=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
let code=readFileSync('lib/fair-response.ts','utf8');for(const file of ['fair-knowledge','fair-guide'])code=code.replace('"./'+file+'"',JSON.stringify(url(readFileSync('lib/'+file+'.ts','utf8'))));
const {fairResponse}=await import(url(code));
test('fair guide always answers from its supplied base, including unknown-question clarification',()=>{
 const ask=content=>fairResponse([{role:'user',content}]);
 assert.match(ask('¿Dónde está ALMA?'),/Chajnantor/);
 assert.match(ask('Dime sobre los trabajos'),/Museo Vivo/);
 assert.match(ask('Cómo programar un videojuego'),/No encuentro una respuesta clara/);
 assert.match(ask('Cómo te llamas'),/Mi nombre es SUU/);
});
