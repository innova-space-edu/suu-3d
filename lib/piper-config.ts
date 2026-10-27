/** Private server-side configuration. Values never reach the client. */
export function piperConfigured():boolean{
 const key=process.env.SUU_TTS_API_TOKEN||"";
 const cfId=process.env.SUU_DELL_CF_ACCESS_CLIENT_ID||"";
 const cfSecret=process.env.SUU_DELL_CF_ACCESS_CLIENT_SECRET||"";
 try{
  const url=new URL(process.env.SUU_TTS_API_BASE_URL||"");
  return url.protocol==="https:"&&url.hostname==="suu-tts.innova-space-edu.cl"
   &&(url.pathname==="/"||!url.pathname)&&!url.search&&!url.hash
   &&!url.username&&!url.password&&key.length>=32&&Boolean(cfId&&cfSecret);
 }catch{return false}
}
