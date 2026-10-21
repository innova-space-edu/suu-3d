export type VoiceEntry={id:string;label:string;locale:string;source:"eduai"|"elevenlabs";gender?:"male"|"female"};
// Mirrors public preset identities in EDUAI's Audio Lab and narration maps.
// Private cloned voices are intentionally NOT enumerated: EDUAI protects them with user+MFA+consent.
export const EDUAI_VOICES:VoiceEntry[]=[
 {id:"es-CL-CatalinaNeural",label:"Catalina · Chile (MIRA)",locale:"es-CL",source:"eduai",gender:"female"},
 {id:"es-CL-LorenzoNeural",label:"Lorenzo · Chile",locale:"es-CL",source:"eduai",gender:"male"},
 {id:"es-ES-AlvaroNeural",label:"Álvaro · España",locale:"es-ES",source:"eduai",gender:"male"},
 {id:"es-ES-ElviraNeural",label:"Elvira · España",locale:"es-ES",source:"eduai",gender:"female"},
 {id:"es-MX-JorgeNeural",label:"Jorge · México",locale:"es-MX",source:"eduai",gender:"male"},
 {id:"es-MX-DaliaNeural",label:"Dalia · México",locale:"es-MX",source:"eduai",gender:"female"},
 {id:"es-US-AlonsoNeural",label:"Alonso · Español (EE. UU.)",locale:"es-US",source:"eduai",gender:"male"},
 {id:"es-US-PalomaNeural",label:"Paloma · Español (EE. UU.)",locale:"es-US",source:"eduai",gender:"female"}
];
export const DEFAULT_VOICE_ID="es-CL-CatalinaNeural";
export function knownVoice(id:string){return EDUAI_VOICES.find(v=>v.id===id)}
export function voiceCatalog(){return [...EDUAI_VOICES,...(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_VOICE_ID?[{id:"elevenlabs:default",label:"ElevenLabs · voz configurada",locale:"multi",source:"elevenlabs" as const}]:[])]}
