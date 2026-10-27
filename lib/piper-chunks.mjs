/** Split at readable boundaries to reduce Piper time-to-first-audio. */
export function splitPiperSpeech(text){
 let remaining=String(text).trim().slice(0,700);
 const phrases=[];
 while(remaining){
  const limit=phrases.length===0?90:150;
  if(remaining.length<=limit){phrases.push(remaining);break}
  const front=remaining.slice(0,limit+1);
  let cut=0;
  // Prefer punctuation at natural boundaries, but never create a tiny clip.
  const punctuation=/[.!?;:](?=\s)/g;
  for(const match of front.matchAll(punctuation)){
   const end=(match.index||0)+1;
   if(end>=20){cut=end;break}
  }
  if(!cut){
   const lastSpace=front.lastIndexOf(" ");
   cut=lastSpace>=limit*.55?lastSpace:limit;
  }
  const phrase=remaining.slice(0,cut).trim();
  if(!phrase){cut=limit;phrases.push(remaining.slice(0,cut))}
  else phrases.push(phrase);
  remaining=remaining.slice(cut).trim();
 }
 return phrases;
}

