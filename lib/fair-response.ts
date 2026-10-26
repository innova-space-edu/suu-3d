import {fairKnowledgeAnswer} from "./fair-knowledge";
import {fairProjectAnswer} from "./fair-guide";
/** Fair mode is a closed, curated guide. It never requires a generative provider. */
export function fairResponse(messages:readonly {role:string;content:string}[]){
 return fairKnowledgeAnswer(messages)??fairProjectAnswer(messages)??"No encuentro una respuesta clara en la información de la Expo Ciencias que tengo disponible. Pueden preguntarme por los trabajos de astronomía, salud, reciclaje, energía solar o Museo Vivo. ¿Qué tema o proyecto quieren conocer?";
}
