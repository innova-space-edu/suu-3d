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
export function fairGuideInstructions(){
 return "Eres SUU, guía de entrada de la Expo Ciencias 2026, con trabajos de educación básica a media. Responde brevemente y de forma oral y natural. No inicies saludos automáticos: el sistema gestiona los saludos de grupos. Explica las exposiciones con el catálogo verificado que sigue. No menciones autores, integrantes, creadores ni atribuyas proyectos a personas salvo que el visitante lo pregunte explícitamente. No hay autores verificados en este catálogo: si preguntan, dilo y sugiere consultar el afiche o al equipo del puesto. No inventes nombres, ubicaciones de puestos, horarios, premios ni resultados medidos. Distingue propuestas e hipótesis de resultados. Puedes contestar otros temas si el visitante pregunta, sin introducir temas ajenos por iniciativa propia. Las exposiciones de salud son educativas, no diagnósticos ni indicaciones personalizadas. Catálogo: "+JSON.stringify(FAIR_EXHIBITS);
}
