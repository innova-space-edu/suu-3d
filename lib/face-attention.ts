/** Only a face's position controls attention. Never mirror its pose or expression. */
export function attentionTarget(centerX:number,centerY:number){
 const clamp=(n:number)=>Math.max(-1,Math.min(1,Number.isFinite(n)?n:0));
 return {gazeX:clamp((.5-centerX)*1.8),gazeY:clamp((.45-centerY)*1.8)};
}
