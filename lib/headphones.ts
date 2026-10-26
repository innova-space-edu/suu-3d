type AudioDevice=Pick<MediaDeviceInfo,"deviceId"|"kind"|"label">;
/** The app uses the system default output. A connected, unused headset is insufficient. */
export function hasDefaultHeadphones(devices:readonly AudioDevice[]):boolean {
 const outputs=devices.filter(d=>d.kind==="audiooutput");
 const current=outputs.find(d=>d.deviceId==="default")||outputs[0];
 // Empty/generic labels are intentionally not treated as proof of headphones.
 return Boolean(current&&!/speakers?|altavoces?|parlantes?|alto[ -]?falantes?/i.test(current.label)&&/headphones?|headsets?|auriculares?|aud[ií]fonos?|airpods?|earbuds?|hands[ -]?free|manos libres/i.test(current.label));
}
export async function readDefaultHeadphones(media?:{enumerateDevices:()=>Promise<readonly AudioDevice[]>}):Promise<boolean>{
 try{return media?hasDefaultHeadphones(await media.enumerateDevices()):false}catch{return false}
}
