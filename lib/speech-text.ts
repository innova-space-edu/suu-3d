/** Small, explicit lexicon for Spanish TTS; never changes English-language playback. */
const ENGLISH_PRONUNCIATIONS:Record<string,string>={
 "innova space education":"Innova Spéis Edyukéishon",
 "innova space":"Innova Spéis",
 "scientificbrain":"Saiéntifik Bréin",
 "openrouter":"Óupen Ráuter",
 "deepseek":"Díp Sík",
 "livekit":"Láiv Kit",
 "github":"Guít Jab",
 "software":"sóftuer",
 "hardware":"járduer",
 "wi-fi":"uái fái",
};
const pronunciationPattern=new RegExp("(?<![\\p{L}\\p{N}_/@.])(?:"+Object.keys(ENGLISH_PRONUNCIATIONS).sort((a,b)=>b.length-a.length).map(key=>key.replace(/ /g,"\\s+")).join("|")+")(?![\\p{L}\\p{N}_]|\\.[\\p{L}\\p{N}])","giu");
export function englishPronunciation(text:string,locale:string){
 if(!/^es(?:-|$)/i.test(locale))return text;
 return text.replace(pronunciationPattern,term=>ENGLISH_PRONUNCIATIONS[term.toLowerCase().replace(/\s+/g," ")]||term);
}

/** Plain spoken content. Visible chat text is never changed by this function. */
export function spokenText(text:string,locale="es-CL"){
 const cleaned=text
  .replace(/\r\n?/g,"\n")
  .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm,"Fragmento de código disponible en el chat.")
  .replace(/^[ \t]{0,3}\[[^\]]+\]:[ \t]+\S+.*$/gm,"")
  .replace(/!?\[([^\]]*)\]\([^\n)]*\)/g,"$1")
  .replace(/\[([^\]]+)\]\[[^\]]*\]/g,"$1")
  .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gm,"")
  .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/gm,"")
  .replace(/^[ \t]{0,3}#{1,6}[ \t]+|[ \t]+#{1,6}[ \t]*$/gm,"")
  .replace(/^[ \t]*(?:>[ \t]*)+/gm,"")
  .replace(/^[ \t]*(?:[-+*•▪◦]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]*)?/gm,"")
  .replace(/`+([^`\n]+)`+/g,"$1")
  .replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g,(_all,a:string,b:string)=>a||b)
  .replace(/(?<![\p{L}\p{N}_])([*_])([^\s*_](?:[^\n]*?[^\s*_])?)\1(?![\p{L}\p{N}_])/gu,"$2")
  .replace(/~~([^~]+)~~/g,"$1")
  // A truncated response may end before its closing emphasis marker.
  .replace(/(?<![\p{L}\p{N}])\*{1,3}(?=\p{L})|(?<=\p{L})\*{1,3}(?![\p{L}\p{N}])/gu,"")
  .replace(/^[^\n]*\|[^\n]*$/gm,line=>/^\s*\||\|\s*$/.test(line)?line.replace(/^\s*\||\|\s*$/g,"").replace(/\s*\|\s*/g,", "):line)
  .replace(/<\/?(?:strong|em|b|i|p|br|span|div|a|code|pre|ul|ol|li|h[1-6]|blockquote|table|thead|tbody|tr|th|td)\b[^>]*>/gi," ")
  .replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
  .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]/gu,"")
  .replace(/\\([*_`~#[\]()>])/g,"$1")
  .replace(/\bSUU\b/gi,"Súu")
  .replace(/[ \t]+/g," ").replace(/[ \t]*\n[ \t]*/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
 return englishPronunciation(cleaned,locale);
}
