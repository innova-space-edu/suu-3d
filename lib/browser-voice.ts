/** Prefer an installed, on-device Spanish voice. Never silently use a remote browser voice.
 * A user explicitly selecting "browser:<uri>" may still choose an online voice.
 */
export function selectBrowserVoice<T extends {voiceURI:string;lang:string;localService:boolean;name?:string}>(voices:T[],id:string,locale:string):T|null {
 const exact=voices.find(v=>id==="browser:"+v.voiceURI);
 if(exact)return exact;
 const lang=locale.toLowerCase().split(/[-_]/)[0];
 const matching=voices.filter(v=>v.localService&&v.lang.toLowerCase().split(/[-_]/)[0]===lang);
 const feminine=/(?:catalina|elvira|dalia|paloma|helena|paulina|sabina|sofia|sofía|lucia|lucía|monica|mónica|maria|maría|isabella|female|mujer)/i;
 const preferred=matching.filter(v=>v.lang.toLowerCase()===locale.toLowerCase());
 return preferred.find(v=>feminine.test(v.name||""))||preferred[0]
   ||matching.find(v=>feminine.test(v.name||""))||matching[0]||null;
}
