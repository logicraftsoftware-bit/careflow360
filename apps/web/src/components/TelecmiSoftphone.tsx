import { useEffect, useRef, useState } from "react";
import PIOPIY, { type PiopiyIncomingCall } from "@telecmi/piopiyjs";
import { Mic, MicOff, Pause, Phone, PhoneCall, PhoneIncoming, PhoneOff, Play, X } from "lucide-react";
import { api, unwrap } from "../api";
import "./TelecmiSoftphone.css";

type PhoneState="connecting"|"ready"|"incoming"|"calling"|"active"|"ended"|"error";

export function TelecmiSoftphone(){
  const client=useRef<PIOPIY|null>(null),[state,setState]=useState<PhoneState>("connecting"),[incoming,setIncoming]=useState<PiopiyIncomingCall|null>(null),[open,setOpen]=useState(false),[number,setNumber]=useState(""),[transferTo,setTransferTo]=useState(""),[muted,setMuted]=useState(false),[held,setHeld]=useState(false),[message,setMessage]=useState("Connecting TeleCMI softphone…");
  useEffect(()=>{
    let active=true,phone:PIOPIY|null=null;
    api.get("/integrations/telecmi/softphone-credentials").then(unwrap).then((credentials:any)=>{
      if(!active)return;
      phone=new PIOPIY({name:credentials.displayName,debug:false,autoplay:true,autoReboot:true,ringTime:60});client.current=phone;
      phone.on("login",()=>{setState("ready");setMessage("Softphone ready");});
      phone.on("loginFailed",(event)=>{setState("error");setMessage(event.status||"TeleCMI login failed");setOpen(true);});
      phone.on("inComingCall",call=>{setIncoming(call);setState("incoming");setMessage(`Incoming call from ${call.name||call.from}`);setOpen(true);});
      phone.on("trying",()=>{setState("calling");setMessage("Starting call…");setOpen(true);});
      phone.on("ringing",event=>{setState(current=>current==="incoming"?current:"calling");setMessage(event.type==="incoming"?"Incoming call":"Customer is ringing…");});
      phone.on("answered",()=>{setState("active");setMessage("Call connected");setIncoming(null);});
      const ended=(event:any)=>{setState("ended");setMessage(event?.status||"Call ended");setIncoming(null);setMuted(false);setHeld(false);setTimeout(()=>active&&setState("ready"),2500);};
      phone.on("ended",ended);phone.on("hangup",ended);
      phone.on("error",event=>{setState("error");setMessage(event.status||"TeleCMI call error");setOpen(true);});
      phone.on("disconnected",()=>{setState("connecting");setMessage("Reconnecting softphone…");});
      phone.on("sbc_logout",event=>{setState("error");setMessage(event.reason||"Softphone signed out");setOpen(true);});
      phone.login(credentials.userId,credentials.password,credentials.sbcUri);
    }).catch((error:any)=>{if(active&&error.response?.status!==403){setState("error");setMessage(error.response?.data?.message||"Unable to start TeleCMI softphone");setOpen(true);}});
    return()=>{active=false;if(phone)phone.logout();client.current=null;};
  },[]);
  const dial=async()=>{let target=number.replace(/\D/g,"");if(target.length===10)target=`91${target}`;if(target.length<10){setMessage("Enter a valid phone number");setState("error");return}try{await navigator.mediaDevices.getUserMedia({audio:true});client.current?.call(target,{extra_param:"careflow360"});}catch{setState("error");setMessage("Allow microphone access to make calls");}};
  const answer=async()=>{try{await navigator.mediaDevices.getUserMedia({audio:true});client.current?.answer();setMessage("Connecting call…");}catch{setState("error");setMessage("Allow microphone access to answer calls");}};
  const reject=()=>client.current?.reject(),hangup=()=>client.current?.terminate();
  const toggleMute=()=>{muted?client.current?.unMute():client.current?.mute();setMuted(!muted);};
  const toggleHold=()=>{held?client.current?.unHold():client.current?.hold();setHeld(!held);};
  const transfer=()=>{const target=transferTo.replace(/\D/g,"");if(!target)return;client.current?.transfer(target,response=>setMessage(response?.error?`Transfer failed: ${response.error}`:"Transfer started"));};
  if(state==="connecting"&&!open)return <button className="softphone-launch connecting" title={message} onClick={()=>setOpen(true)}><PhoneCall/></button>;
  return <div className={`softphone ${open?"open":""}`}>
    {!open?<button className={state==="incoming"?"softphone-launch ringing":"softphone-launch"} onClick={()=>setOpen(true)}>{state==="incoming"?<PhoneIncoming/>:<PhoneCall/>}<span>{state==="incoming"?incoming?.name||incoming?.from:"Softphone"}</span></button>:<section className="softphone-panel">
      <header><div><small>TELECMI WEB PHONE</small><strong>{message}</strong></div>{state!=="incoming"&&state!=="active"&&state!=="calling"&&<button onClick={()=>setOpen(false)}><X/></button>}</header>
      {state==="incoming"?<div className="softphone-incoming"><PhoneIncoming/><b>{incoming?.name||incoming?.from||"Incoming call"}</b>{incoming?.name&&<span>{incoming.from}</span>}<div><button className="answer" onClick={answer}><Phone/>Answer</button><button className="decline" onClick={reject}><PhoneOff/>Reject</button></div></div>:state==="active"||state==="calling"?<div className="softphone-active"><PhoneCall/><b>{state==="active"?"Connected":"Calling"}</b><div><button className={muted?"selected":""} onClick={toggleMute}>{muted?<MicOff/>:<Mic/>}{muted?"Unmute":"Mute"}</button><button className={held?"selected":""} onClick={toggleHold}>{held?<Play/>:<Pause/>}{held?"Resume":"Hold"}</button><button className="decline" onClick={hangup}><PhoneOff/>End</button></div>{state==="active"&&<form className="softphone-transfer" onSubmit={event=>{event.preventDefault();transfer()}}><input value={transferTo} onChange={event=>setTransferTo(event.target.value)} placeholder="Extension or number"/><button>Transfer</button></form>}</div>:<form onSubmit={event=>{event.preventDefault();dial()}}><input value={number} onChange={event=>setNumber(event.target.value)} placeholder="Customer number" inputMode="tel"/><button disabled={state!=="ready"}><Phone/>Call</button></form>}
    </section>}
  </div>;
}
