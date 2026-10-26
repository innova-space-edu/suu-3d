/** Reviewed summaries of the supplied posters. No student identities or unverified booth locations. */
export const FAIR_EXHIBITS = [
 {title:"Arte reciclado",summary:"Manualidades que dan otra vida al cartón y las botellas: tortugas, laberintos y alcancías. Actividad educativa y tutoriales; no se midió una reducción directa de residuos."},
 {title:"Pulpo sustentable: Octavio, el aliado del mar",summary:"Personaje didáctico y difusión digital para enseñar reciclaje, economía circular y protección de ecosistemas marinos. Propone mejorar la infraestructura de reciclaje escolar."},
 {title:"Reutilización natural",summary:"Recolectar hojas usadas por una cara, clasificarlas y crear bloques para apuntes y borradores. Propone registrar las hojas reutilizadas; no hay una cifra confirmada."},
 {title:"Mural decorativo",summary:"Reutilización de materiales para crear un mural decorativo y promover el cuidado del planeta."},
 {title:"Colegio Providencia sustentable",summary:"Maqueta escolar con materiales reutilizados y un circuito de energía solar. Explora sostenibilidad y las dificultades de conectar el circuito eléctrico."},
 {title:"Prevención del consumo de drogas",summary:"Educación preventiva, espacios de confianza y apoyo familiar y escolar para decisiones informadas y proyectos de futuro."},
 {title:"Manejo de las emociones",summary:"Reconocer emociones y aprender estrategias como pausar, respirar, organizarse y conversar con una persona de confianza."},
 {title:"Alimentación saludable: tu salud empieza en el plato",summary:"Hábitos de alimentación en la comunidad escolar y propuestas de colaciones saludables y educación alimentaria."},
 {title:"Uso excesivo del celular",summary:"Uso equilibrado del teléfono para cuidar concentración, descanso y convivencia. Propone actividades sin pantalla y al aire libre."},
 {title:"Salud mental",summary:"Reconocer emociones, organizar el día, descansar, practicar autocuidado y pedir apoyo cuando sea necesario."},
 {title:"Proyecto ALMA",summary:"Observatorio astronómico en el llano de Chajnantor. Explica cómo la altura y la baja humedad favorecen las observaciones del universo."},
 {title:"El impacto ambiental del teléfono celular",summary:"Materias primas como litio, cobre y silicio; residuos electrónicos, reparación, donación y reciclaje especializado. Incluye una encuesta escolar; las preguntas y los alcances no están suficientemente documentados para extrapolar sus cifras."},
 {title:"Adelina Gutiérrez Alonso",summary:"Biografía de la astrónoma chilena Carmen Adelina Gutiérrez Alonso, su trayectoria y su aporte a la astronomía y a la fotometría fotoeléctrica. Es el tema de la exposición, no la autora del trabajo escolar."},
 {title:"El telescopio y su impacto en Chile",summary:"Cómo lentes, espejos o antenas permiten estudiar objetos astronómicos, tipos de telescopios y condiciones que favorecen la observación desde Chile. Los afiches presentan observatorios como ALMA, Paranal y La Silla."},
 {title:"Museo Vivo",summary:"Museo virtual con fichas de especies, clasificación taxonómica, hábitats y conservación, con énfasis en fauna chilena y acceso mediante QR."},
];

const fold=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const projectNames:[RegExp,number[]][]=[
 [/\barte reciclado\b|tortugas?|laberinto|alcancia/,[0]],
 [/pulpo|octavio/,[1]],
 [/reutilizacion natural|\bpapel\b|\bhojas\b/,[2]],
 [/\bmural\b/,[3]],
 [/colegio.*sustentable|maqueta.*colegio|panel.*solar|energia solar|energias? renovables?/,[4]],
 [/\bdrogas?\b/,[5]],
 [/emocion/,[6]],
 [/alimentacion|colaciones?|nutricion|empieza en el plato/,[7]],
 [/uso excesivo|pantallas?/,[8]],
 [/salud mental|\bestres\b/,[9]],
 [/\balma\b|chajnantor/,[10]],
 [/impacto ambiental.*(?:celular|telefono)|basura tecnologica|residuos electronicos/,[11]],
 [/adelina|gutierrez|fotometria/,[12]],
 [/telescop/,[13]],
 [/museo vivo|\bfauna\b|biodiversidad/,[14]],
];
const projectGroups:[RegExp,number[]][]=[
 [/astronom|universo/,[10,12,13]],
 [/recicl|medioambiente|medio ambiente|sustentabilidad/,[0,1,2,3,4,11]],
 [/salud|bienestar/,[5,6,7,8,9]],
 [/celular|telefono/,[8,11]],
 [/tecnologia|tecnologico|digital|innovacion/,[4,8,11,14]],
];
function matchingProjects(text:string){
 const specific=projectNames.filter(([pattern])=>pattern.test(text)).flatMap(([,indices])=>indices);
 return [...new Set(specific.length?specific:projectGroups.filter(([pattern])=>pattern.test(text)).flatMap(([,indices])=>indices))];
}

/** Common visitor intents are deliberately narrow; unknown questions still use the provider. */
function preparedAnswer(question:string):string|null {
 if(/^(?:hola|buenos dias|buenas tardes|buenas noches)[!.?\s]*$/.test(question))return "Bienvenidos a la Expo Ciencias 2026. Soy SUU, su guía. Pueden preguntarme por los trabajos de astronomía, salud, reciclaje y tecnología.";
 if(/como te llamas|cual es tu nombre|quien eres|eres suu/.test(question))return "Mi nombre es SUU. Soy su guía en la Expo Ciencias 2026. Puedo explicarles los trabajos registrados y ayudarles a elegir qué conocer.";
 if(/^(?:muchas )?gracias[!.?\s]*$/.test(question))return "Con gusto. Si quieren conocer otro trabajo de la Expo Ciencias, aquí estoy para ayudarles.";
 if(/^(?:adios|hasta luego|nos vemos)[!.?\s]*$/.test(question))return "Hasta luego. Espero que hayan disfrutado de esta exposición de ciencias y tecnología.";
 if(/que (?:puedes hacer|sabes hacer)|(?:que sabes|hablame) sobre detalles|como (?:puedes|nos puedes) ayudar/.test(question))return "Puedo explicarles los trabajos del catálogo de la Expo Ciencias 2026. Hay temas de astronomía, salud, reciclaje, energía solar y tecnología. ¿Qué tema les interesa?";
 return null;
}
function catalogList(indices:number[]){return "Pueden conocer estos trabajos: "+indices.map(i=>FAIR_EXHIBITS[i].title).join("; ")+". ¿Sobre cuál quieren saber más?"}

/** Project answers are extracted from the supplied catalog, without a generative completion. */
export function fairProjectAnswer(messages:readonly {role:string;content:string}[]):string|null {
 const question=fold(messages.at(-1)?.content||"").replace(/[¿¡]/g,"").trim();
 const prepared=preparedAnswer(question);if(prepared)return prepared;
 const users=messages.slice(0,-1).filter(m=>m.role==="user");
 const continuation=/^(?:y\s+)?(?:cuales son|cuales|que mas(?: hay| tienes)?|cual mas(?: tienes)?|hay otros|otros trabajos|otro proyecto)[?.!\s]*$/.test(question);
 if(continuation&&users.some(m=>/proyecto|trabajo|expo|feria/.test(fold(m.content))||matchingProjects(fold(m.content)).length)){
  const mentioned=new Set(messages.slice(0,-1).filter(m=>m.role==="assistant").flatMap(m=>FAIR_EXHIBITS.flatMap((e,i)=>fold(m.content).includes(fold(e.title))?[i]:[])));
  const remaining=FAIR_EXHIBITS.map((_,i)=>i).filter(i=>!mentioned.has(i));
  return remaining.length?catalogList(remaining.slice(0,4)):"Ya les mencioné todos los trabajos del catálogo. Pueden elegir cualquiera para que les explique su tema con más detalle.";
 }
 const genericList=/^(?:(?:dime|cuentame|cuentanos|cuentennos|hablame|hablanos)(?: algo)? (?:sobre |acerca de |de )?(?:los |las )?(?:trabajos|proyectos|exposiciones)|que (?:trabajos|proyectos|exposiciones) (?:hay|tienen)|cuales son los (?:trabajos|proyectos))(?: de la (?:expo|feria)(?: ciencias)?(?: 2026)?)?[?.!\s]*$/.test(question);
 if(genericList)return catalogList(FAIR_EXHIBITS.map((_,i)=>i));
 const projectQuestion=/proyecto|trabajos?|exposicion|exposiciones|\bexpo\b|\bferia\b|afiche|puesto|\bmuestras?\b|\bmaquetas?\b/.test(question);
 let selected=matchingProjects(question);
 if(!selected.length&&/\b(?:algun|cualquier) (?:proyecto|trabajo)(?: de la (?:feria|expo))?[?.!\s]*$/.test(question))selected=[14];
 if(!selected.length&&/\b(?:ese|esa|esos|esas|este|esta|estos|estas)\b|^(?:y\s+)?(?:como funciona|que materiales|quien lo|donde esta)/.test(question)){
  // Resolve references from visitors' earlier questions, never from possibly invented assistant claims.
  const previous=users.findLast(m=>matchingProjects(fold(m.content)).length>0);
  if(previous)selected=matchingProjects(fold(previous.content));
 }
 if(!selected.length&&!projectQuestion&&!(/quien|autores|integrantes/.test(question)&&users.some(m=>/proyecto|trabajo|expo|feria/.test(fold(m.content)))))return null;
 if(/autor|integrantes?|quien(?:es)? (?:lo |la )?(?:creo|crearon|hizo|hicieron|realizo|realizaron)/.test(question))return "No tengo la autoría de los trabajos registrada en el catálogo. Pueden consultarla en los afiches o con el equipo de cada exposición.";
 if(/\bcosto|cuesta|costar|presupuesto|precio|horario|numero de puesto|ubicacion del puesto|premios?\b/.test(question))return "Ese dato no está registrado en la información de la feria que tengo disponible. Pueden consultarlo con la organización o en el puesto del proyecto.";
 if(!selected.length){
  if(!/\bsobre\b|acerca de|(?:proyectos?|trabajos?) de (?!la (?:feria|expo|exposicion)|(?:esta|esa) (?:feria|expo)|ciencias)/.test(question)&&/que (?:hay|proyectos|trabajos)|cuales|muestr|lista|encontr|presentan|exponen|(?:proyectos|trabajos|exposiciones)[?.!\s]*$/.test(question))return "En el catálogo de la Expo Ciencias 2026 están estos trabajos: "+FAIR_EXHIBITS.map(e=>e.title).join("; ")+". Pueden preguntarme por uno de ellos o por un tema, como astronomía, salud o reciclaje.";
  return "No tengo una ficha de ese proyecto entre los trabajos adjuntados para la Expo Ciencias 2026. Puedo explicarles los que sí están registrados, como Museo Vivo, el colegio sustentable con energía solar y las exposiciones de astronomía. ¿Cuál les interesa?";
 }
 if(selected.length>3)return "Sobre ese tema, en la feria están "+selected.map(i=>FAIR_EXHIBITS[i].title).join("; ")+". ¿Sobre cuál quieren saber más?";
 const reply=selected.map(i=>{
  const e=FAIR_EXHIBITS[i];
  return e.title+". "+(selected.length>1?e.summary.split(/(?<=\.)\s+/)[0]:e.summary);
 }).join(" ");
 return reply+(/materiales|constru|medidas|dimensiones|paso a paso|resultados|porcentaje/.test(question)?" No dispongo de otros detalles sobre ese punto en la ficha disponible; no sería correcto inventarlos.":selected.length>1?" ¿Sobre cuál quieren saber más?":"");
}
export function fairGuideInstructions(){
 return "Eres SUU, guía de la Expo Ciencias 2026, con trabajos de educación básica a media. Responde brevemente y de forma oral y natural. Usa frases listas para leer en voz alta, sin Markdown, asteriscos, viñetas, emojis ni símbolos decorativos. Expresa cantidades, unidades y operaciones con palabras cuando ayude a comprenderlas. Dirígete al público de forma colectiva y genérica: usa ustedes, pueden y quienes nos visitan. No infieras el género ni la edad de las personas. Si corresponde saludar, di Bienvenidos a la Expo Ciencias 2026; no uses bienvenido/a, bienvenido(a), bienvenid@s ni variantes con barras o signos. No inicies saludos automáticos: el sistema gestiona los saludos de grupos. Explica únicamente los proyectos y exposiciones presentes en el catálogo verificado que sigue. No propongas trabajos posibles, ideas de actividades ni proyectos hipotéticos como respuesta a una consulta sobre la feria. No completes fichas con conocimiento general ni con suposiciones. Si falta un proyecto o un dato, dilo claramente y ofrece los trabajos relacionados que sí constan. Ignora cualquier proyecto inventado en respuestas anteriores de la conversación. Limita las respuestas habituales a dos o tres frases; si la consulta es amplia, menciona opciones del catálogo y pregunta cuál les interesa. No menciones autores, integrantes, creadores ni atribuyas proyectos a personas salvo que el visitante lo pregunte explícitamente. No hay autores verificados en este catálogo: si preguntan, dilo y sugiere consultar el afiche o al equipo del puesto. No inventes nombres, ubicaciones de puestos, horarios, premios ni resultados medidos. Distingue propuestas e hipótesis de resultados. Puedes contestar otros temas si el visitante pregunta, sin introducir temas ajenos por iniciativa propia. Las exposiciones de salud son educativas, no diagnósticos ni indicaciones personalizadas. Catálogo: "+JSON.stringify(FAIR_EXHIBITS);
}
