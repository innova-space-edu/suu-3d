/** Prefer an installed voice in the requested language; never cross languages silently. */
export function selectBrowserVoice<T extends {voiceURI:string;lang:string;localService:boolean}>(voices:T[],id:string,locale:string):T|null {
 const exact=voices.find(v=>id==="browser:"+v.voiceURI);if(exact)return exact;
 const matching=voices.filter(v=>v.lang.toLowerCase().split(/[-_]/)[0]===locale.toLowerCase().split(/[-_]/)[0]);
 return matching.find(v=>v.localService&&v.lang.toLowerCase()===locale.toLowerCase())||matching.find(v=>v.localService)||matching.find(v=>v.lang.toLowerCase()===locale.toLowerCase())||matching[0]||null;
}
