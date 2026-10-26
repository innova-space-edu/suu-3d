"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {readDefaultHeadphones} from "@/lib/headphones";

/** Enumeration only: opening SUU/settings never captures audio or asks for permission. */
export function useHeadphoneOutput(){
 const [active,setActive]=useState(false);
 const mounted=useRef(false),revision=useRef(0);
 const refresh=useCallback(async()=>{
  const ticket=++revision.current;
  const found=await readDefaultHeadphones(navigator.mediaDevices);
  if(!mounted.current||ticket!==revision.current)return false;
  setActive(found);return found;
 },[]);
 useEffect(()=>{
  mounted.current=true;let cancelled=false,permission:PermissionStatus|undefined;
  const changed=()=>{void refresh()};
  void refresh();navigator.mediaDevices?.addEventListener("devicechange",changed);window.addEventListener("focus",changed);
  void navigator.permissions?.query({name:"microphone" as PermissionName}).then(status=>{if(!cancelled){permission=status;status.addEventListener("change",changed)}}).catch(()=>{});
  return()=>{cancelled=true;mounted.current=false;revision.current++;navigator.mediaDevices?.removeEventListener("devicechange",changed);window.removeEventListener("focus",changed);permission?.removeEventListener("change",changed)};
 },[refresh]);
 return {active,refresh};
}
