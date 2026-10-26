import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/speech-text.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {spokenText,fairAudienceText,fairSpokenText}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
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

test('fair welcomes address the audience collectively instead of slash or parenthesis variants',()=>{
 for(const greeting of ['Bienvenido/a','Bienvenido(a)','Bienvenidos/as','Bienvenid@s','Bienvenidxs','Bienvenido','Bienvenida'])assert.equal(fairAudienceText(greeting+' a la Expo Ciencias 2026.'),'Bienvenidos a la Expo Ciencias 2026.',greeting);
 assert.equal(fairAudienceText('**Bienvenido/a**. Hola a todos/as.'),'**Bienvenidos**. Hola a todos.');
 assert.equal(fairAudienceText('Gracias por la cálida bienvenida. La bienvenida a la Expo será breve.'),'Gracias por la cálida bienvenida. La bienvenida a la Expo será breve.');
});
test('fair narration removes residual ornaments and formatting without changing visible source text',()=>{
 const source='### ¡Bienvenido/a a la Expo!\n★ **Salud** → _Energía_ ✓\n* Visiten Museo Vivo. \u0026ast;';
 const speech=fairSpokenText(source);
 assert.match(speech,/Bienvenidos a la Expo/);assert.match(speech,/Salud/);assert.match(speech,/Energía/);assert.ok(!/[★→✓#*_¡@/]/u.test(speech));assert.ok(source.includes('**Salud**'));
 assert.equal(fairSpokenText(speech),speech);
});
test('fair speech keeps scientific quantities and voices arithmetic instead of decorative symbols',()=>{
 const speech=fairSpokenText('Paneles: 25%; agua: 20 °C; cálculo: 2*3 = 6.');
 assert.match(speech,/25 por ciento/);assert.match(speech,/20 grados Celsius/);assert.match(speech,/2 por 3 = 6/);
 assert.equal(fairSpokenText('25% and 2*3','en-US'),'25 percent and 2 times 3');
 assert.equal(spokenText('Bienvenido/a: 25% y 2*3.'),'Bienvenido/a: 25% y 2*3.');
});
test('fair voice refers to visible links and emails without spelling their punctuation',()=>{
 const speech=fairSpokenText('Ve a https://example.com/museo o escribe a contacto@example.com.');
 assert.ok(!speech.includes('https:'));assert.ok(!speech.includes('@'));assert.match(speech,/enlace disponible en pantalla/);assert.match(speech,/correo disponible en pantalla/);
});
