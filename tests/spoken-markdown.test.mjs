import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/speech-text.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {spokenText}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('assistant bullets and bold are spoken without markdown markers',()=>{
 const raw='¡Hola!\n\n*   **Conversar contigo:** Podemos charlar.\n*   **Ayudarte a investigar:** Puedo resumir conceptos.\n\nDime, ¿en qué te ayudo?';
 const out=spokenText(raw);assert.equal(out,'¡Hola!\n\nConversar contigo: Podemos charlar.\nAyudarte a investigar: Puedo resumir conceptos.\n\nDime, ¿en qué te ayudo?');assert.ok(raw.includes('**'));
});
test('links, headings, lists, tables and decorative emoji retain readable content',()=>{
 const out=spokenText('# SUU\n> **Hola**\n1. Lee [este enlace](https://example.com).\n- [x] Listo ✅\n| Voz | País |\n| --- | --- |\n| Catalina | Chile |');
 assert.ok(out.includes('Súu\nHola'));assert.ok(out.includes('Lee este enlace.'));assert.ok(out.includes('Catalina, Chile'));assert.ok(!/[#*|\[\]✅]/u.test(out));
});
test('numbers and meaningful operators survive; code formatting is not narrated',()=>{
 assert.equal(spokenText('Costo: $1.000. 3.14; 50%; 2 + 3 = 5; 2*3 = 6.'),'Costo: $1.000. 3.14; 50%; 2 + 3 = 5; 2*3 = 6.');
 assert.equal(spokenText('Usa `SUU_API_KEY` y _lee_ **esto**.'),'Usa SUU_API_KEY y lee esto.');
 assert.equal(spokenText('```js\nconsole.log("hola");\n```'),'Fragmento de código disponible en el chat.');
});
test('cleanup is idempotent and handles orphan bold from truncated replies',()=>{
 const text='**Hola, soy SUU.\n* **Investigar:** Buscar información.';
 const clean=spokenText(text);assert.ok(!clean.includes('*'));assert.equal(spokenText(clean),clean);
 assert.equal(spokenText('***\n---'),'');
});

test('Spanish voices pronounce the organization name and explicit English technology terms',()=>{
 assert.equal(spokenText('Soy SUU, de Innova Space Education. Usamos OpenRouter y DeepSeek.'),'Soy Súu, de Innova Spéis Edyukéishon. Usamos Óupen Ráuter y Díp Sík.');
 assert.equal(spokenText('INNOVA   SPACE EDUCATION, ScientificBrain y LiveKit.'),'Innova Spéis Edyukéishon, Saiantífik Bréin y Láiv Kit.');
});
test('pronunciation changes are idempotent and do not rewrite English voices, identifiers or domains',()=>{
 const original='Welcome to Innova Space Education. OpenRouter software.';
 assert.equal(spokenText(original,'en-US'),original);
 assert.equal(spokenText(original,'pt-BR'),original);
 const spanish=spokenText(original,'es-CL');assert.equal(spokenText(spanish,'es-CL'),spanish);
 assert.equal(spokenText('https://github.com SUU_GITHUB_API myOpenRouter github.com'),'https://github.com SUU_GITHUB_API myOpenRouter github.com');
 assert.equal(original,'Welcome to Innova Space Education. OpenRouter software.');
});
