/** Deterministic arithmetic and a small, explicitly sourced knowledge base.
 * These guards do not imply that the language model has improved.
 */
type Fraction={n:bigint;d:bigint};
function fraction(n:bigint,d=BigInt(1)):Fraction{
 if(d===BigInt(0))throw new Error("No se puede dividir por cero.");
 if(d<BigInt(0)){n=-n;d=-d}
 let a=n<BigInt(0)?-n:n,b=d;while(b){const r=a%b;a=b;b=r}
 n/=a||BigInt(1);d/=a||BigInt(1);
 if(n.toString().length>200||d.toString().length>200)throw new Error("La operación excede el límite de cálculo local.");
 return {n,d};
}
export function calculate(expression:string):Fraction{
 const raw=expression.replace(/[×x]/gi,"*").replace(/÷/g,"/").replace(/−/g,"-").replace(/,/g,".").replace(/\s+/g,"");
 if(!raw||raw.length>100||!/^[\d.+*/^()-]+$/.test(raw))throw new Error("Expresión no admitida.");
 const tokens=raw.match(/\d+(?:\.\d+)?|\.\d+|[+*/^()-]/g)||[];
 if(tokens.join("")!==raw||tokens.length>80)throw new Error("Expresión no admitida.");
 let pos=0,depth=0;
 const primary=():Fraction=>{
  if(++depth>20)throw new Error("Expresión demasiado anidada.");
  try{
   if(tokens[pos]==="("){pos++;const value=sum();if(tokens[pos++]!==")")throw new Error("Paréntesis incompletos.");return value}
   const number=tokens[pos++];
   if(!number||!/^\d*\.?\d+$/.test(number)||number.length>20)throw new Error("Número inválido.");
   const decimals=number.split(".")[1]?.length||0;
   return fraction(BigInt(number.replace(".","")),BigInt(10)**BigInt(decimals));
  }finally{depth--}
 };
 const power=():Fraction=>{
  const value=primary();if(tokens[pos]!=="^")return value;pos++;
  const exponent=unary();if(exponent.d!==BigInt(1)||exponent.n>BigInt(12)||exponent.n< -BigInt(12))throw new Error("Solo se admiten exponentes enteros entre -12 y 12.");
  const e=exponent.n<BigInt(0)?-exponent.n:exponent.n;
  if(value.n===BigInt(0)&&exponent.n===BigInt(0))throw new Error("0 elevado a 0 no está definido en este cálculo.");
  return exponent.n<BigInt(0)?fraction(value.d**e,value.n**e):fraction(value.n**e,value.d**e);
 };
 const unary=():Fraction=>{
  if(tokens[pos]==="+"||tokens[pos]==="-"){const sign=tokens[pos++];const value=unary();return sign==="-"?fraction(-value.n,value.d):value}
  return power();
 };
 const product=():Fraction=>{
  let value=unary();while(tokens[pos]==="*"||tokens[pos]==="/"){
   const op=tokens[pos++],other=unary();
   value=op==="*"?fraction(value.n*other.n,value.d*other.d):fraction(value.n*other.d,value.d*other.n);
  }return value;
 };
 const sum=():Fraction=>{
  let value=product();while(tokens[pos]==="+"||tokens[pos]==="-"){
   const op=tokens[pos++],other=product();
   value=fraction(value.n*other.d+(op==="+"?BigInt(1):-BigInt(1))*other.n*value.d,value.d*other.d);
  }return value;
 };
 const result=sum();if(pos!==tokens.length)throw new Error("Expresión incompleta.");return result;
}
function normalize(text:string){return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[¿?¡!]/g,"").trim()}
export function arithmeticReply(text:string){
 let expression=normalize(text).replace(/\.$/,"");
 expression=expression.replace(/^(?:(?:que me dices|cuanto es|cuanto da|cuanto vale|calcula|resuelve|cual es el resultado de)[,:]?\s*)+/,"").replace(/\s*(?:es|da|=)\s*$/,"").trim();
 if(!/^[\d\s.+*/^(),x×÷−-]+$/i.test(expression)||!/[\d]/.test(expression))return null;
 try{
  const {n,d}=calculate(expression);
  // A rational representation avoids silently rounding a non-terminating result.
  const result=d===BigInt(1)?String(n):`${n}/${d}`;
  return `${expression.replace(/\*/g," × ").replace(/\s+/g," ")} = ${result}.`;
 }catch(error){return error instanceof Error?error.message:"No pude calcular esa expresión."}
}
const planets="Mercurio, Venus, Tierra, Marte, Júpiter, Saturno, Urano y Neptuno";
const nasa=[{title:"NASA · Sistema solar",url:"https://science.nasa.gov/solar-system/"}];
export function reliableAnswer(text:string){
 const arithmetic=arithmeticReply(text);
 if(arithmetic)return {reply:arithmetic,provider:"Cálculo local",model:"rational-arithmetic",sources:[] as {title:string;url:string}[]};
 const query=normalize(text).replace(/\.$/,"");
 if(/^(?:como que puedes hacer|que puedes hacer|que me puedes (?:hacer|ayudar)|cuales son tus (?:funciones|capacidades)|en que me puedes ayudar)$/.test(query)||/^(?:puedes|sabes) (?:controlar|manejar|interactuar con) (?:mi|el|tu) navegador$/.test(query))
  return {reply:"Puedo conversar por texto y voz, explicar temas y ayudarte a preparar contenido educativo. No controlo tu navegador ni ejecuto acciones externas desde esta conversación. Algunas áreas pueden consultar servicios si están conectados en SUU.",provider:"Funciones de SUU",model:"capabilities",sources:[]};
 if(/^(?:que (?:es|sabes(?: sobre)?|me puedes decir(?: sobre)?|me dices(?: sobre)?)|hablame(?: sobre| de)?|cuentame(?: sobre| del)?|explicame|explica|describe)\s+(?:el |del |sobre el )?sistema solar(?: en general)?$/.test(query))
  return {reply:`El sistema solar está formado por el Sol y los cuerpos que orbitan a su alrededor. Tiene ocho planetas: ${planets}. También incluye lunas, asteroides y cometas. Mercurio es el planeta más cercano al Sol; la Tierra es el tercero.`,provider:"Base verificada · NASA",model:"solar-system-reference",sources:nasa};
 if(/^(?:cual|que) (?:es el )?planeta (?:es el )?(?:mas cercano|mas proximo) al sol$/.test(query))
  return {reply:"Mercurio es el planeta más cercano al Sol. La Tierra ocupa el tercer lugar.",provider:"Base verificada · NASA",model:"solar-system-reference",sources:nasa};
 if(/^(?:cual es el orden de los planetas|ordena los planetas|cuales son los planetas)(?: del sistema solar| desde el sol)?$/.test(query))
  return {reply:`Desde el Sol, el orden de los ocho planetas es: ${planets}.`,provider:"Base verificada · NASA",model:"solar-system-reference",sources:nasa};
 return null;
}
