"use client";
export type SuuMode="library"|"chat"|"conversation"|"quick"|"fair-welcome"|"fair-guide";
export default function SuuModePicker({value,onChange,disabled=false}:{value:SuuMode;onChange:(mode:SuuMode)=>void;disabled?:boolean}){
 return <label className="suuModePicker">Modo <select aria-label="Modo de SUU" disabled={disabled} value={value} onChange={e=>onChange(e.target.value as SuuMode)}><option value="library">Biblioteca · crear y reutilizar audio</option><option value="chat">Chat · texto y voz</option><option value="conversation">Conversación</option><option value="quick">Conversación ágil · breve</option><option value="fair-welcome">Feria · bienvenida automática</option><option value="fair-guide">Feria · preguntas y guía</option></select></label>;
}
