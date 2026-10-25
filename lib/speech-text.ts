/** Spoken form only: prevent letter-by-letter reading of the assistant's name. */
export function spokenText(text:string){return text.replace(/\bSUU\b/gi,"Súu")}
