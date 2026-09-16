import { useEffect, useRef, useState } from "react";
import PIOPIY, { type PiopiyIncomingCall } from "@telecmi/piopiyjs";
import Connly from "connly";
import { Mic, MicOff, Pause, Phone, PhoneCall, PhoneIncoming, PhoneOff, Play, X } from "lucide-react";
import { api, unwrap } from "../api";
import "./TelecmiSoftphone.css";

type PhoneState="connecting"|"ready"|"incoming"|"calling"|"active"|"ended"|"error";
type AgentStatus="online"|"offline"|"break";

export function TelecmiSoftphone(){
  const client=useRef<PIOPIY|null>(null),connlyClient=useRef<Connly|null>(null),connlyConnected=useRef(false),ringContext=useRef<AudioContext|null>(null),ringTimer=useRef<number|null>(null),[state,setState]=useState<PhoneState>("connecting"),[agentStatus,setAgentStatus]=useState<AgentStatus>("offline"),[statusBusy,setStatusBusy]=useState(false),[incoming,setIncoming]=useState<PiopiyIncomingCall|null>(null),[open,setOpen]=useState(false),[number,setNumber]=useState(""),[transferTo,setTransferTo]=useState(""),[muted,setMuted]=useState(false),[held,setHeld]=useState(false),[message,setMessage]=useState("Connecting TeleCMI softphone…");
  const stopRingtone=()=>{if(ringTimer.current!==null){window.clearInterval(ringTimer.current);ringTimer.current=null}};
  const startRingtone=()=>{if(ringTimer.current!==null)return;const AudioContextClass=window.AudioContext||(window as any).webkitAudioContext;if(!AudioContextClass)return;const context=ringContext.current||new AudioContextClass();ringContext.current=context;const ring=()=>{void context.resume().then(()=>{[0,0.22].forEach(offset=>{const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+offset;oscillator.frequency.value=880;gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(0.18,start+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,start+0.16);oscillator.connect(gain).connect(context.destination);oscillator.start(start);oscillator.stop(start+0.18)})}).catch(()=>undefined)};ring();ringTimer.current=window.setInterval(ring,1800);};
  useEffect(()=>{
    let active=true,phone:PIOPIY|null=null,presence:Connly|null=null,sipReady=false,presenceReady=false;
    const markReady=()=>{if(active&&sipReady&&presenceReady){setState("ready");setMessage("Softphone ready · Online");}};
    api.get("/integrations/telecmi/softphone-credentials").then(unwrap).then((credentials:any)=>{
      if(!active)return;
      presence=new Connly(credentials.connlyServerUrl,credentials.connlyToken);connlyClient.current=presence;
      presence.onConnect(({isConnected})=>{if(!active||!isConnected)return;connlyConnected.current=true;presenceReady=true;presence?.setStatus("online");setAgentStatus("online");markReady();});
      presence.onDisconnect(()=>{if(!active)return;connlyConnected.current=false;presenceReady=false;setAgentStatus("offline");setState("connecting");setMessage("Reconnecting Connly presence…");});
      presence.onError((event:any)=>{if(!active)return;console.error("[Connly] connection error",event);setState("error");setMessage(event?.message||"Connly presence connection failed");setOpen(true);});
      presence.connect();
      presence.onStatus((event:any)=>{if(!active)return;const status=String(event?.status||event?.data?.status||"").toLowerCase();if(status==="online"||status==="offline"||status==="break")setAgentStatus(status);});
      presence.onCallAction((event:any)=>{if(!active)return;console.info("[Connly] call action",event);const action=String(event?.action||event?.status||event?.type||"").toLowerCase();if(action.includes("incoming")||action.includes("ring")){setMessage("Incoming call notification received…");setOpen(true);}});
      phone=new PIOPIY({name:credentials.displayName,debug:true,autoplay:true,autoReboot:true,ringTime:60});client.current=phone;
      phone.on("login",()=>{sipReady=true;markReady();});
      phone.on("loginFailed",(event)=>{setState("error");setMessage(event.status||"TeleCMI login failed");setOpen(true);});
      const receiveIncoming=(call:any)=>{const incomingCall=call as PiopiyIncomingCall;setIncoming(incomingCall);setState("incoming");setMessage(`Incoming call from ${incomingCall.name||incomingCall.from||"customer"}`);setOpen(true);startRingtone();};
      phone.on("inComingCall",receiveIncoming);
      // TeleCMI SDK releases have used both spellings; listening to the alias is
      // harmless and prevents an SDK-version mismatch from hiding the call UI.
      (phone as any).on("incomingCall",receiveIncoming);
      phone.on("trying",()=>{setState("calling");setMessage("Starting call…");setOpen(true);});
      phone.on("ringing",event=>{const payload:any=event,isIncoming=String(payload.type||payload.direction||"").toLowerCase().includes("incoming");if(isIncoming){receiveIncoming(payload);return}setState(current=>current==="incoming"?current:"calling");setMessage("Customer is ringing…");});
      phone.on("answered",()=>{stopRingtone();setState("active");setMessage("Call connected");setIncoming(null);});
      const ended=(event:any)=>{stopRingtone();setState("ended");setMessage(event?.status||"Call ended");setIncoming(null);setMuted(false);setHeld(false);setTimeout(()=>active&&setState("ready"),2500);};
      phone.on("ended",ended);phone.on("hangup",ended);
      phone.on("error",event=>{setState("error");setMessage(event.status||"TeleCMI call error");setOpen(true);});
      phone.on("disconnected",()=>{setState("connecting");setAgentStatus("offline");setMessage("Reconnecting softphone…");});
      phone.on("sbc_logout",event=>{setState("error");setMessage(event.reason||"Softphone signed out");setOpen(true);});
      phone.login(credentials.userId,credentials.password,credentials.sbcUri);
    }).catch((error:any)=>{if(active&&error.response?.status!==403){setState("error");setMessage(error.response?.data?.message||"Unable to start TeleCMI softphone");setOpen(true);}});
    return()=>{active=false;stopRingtone();if(ringContext.current)void ringContext.current.close();ringContext.current=null;if(presence)presence.disconnect();if(phone)phone.logout();connlyConnected.current=false;connlyClient.current=null;client.current=null;};
  },[]);
  const dial=async()=>{let target=number.replace(/\D/g,"");if(target.length===10)target=`91${target}`;if(target.length<10){setMessage("Enter a valid phone number");setState("error");return}try{await navigator.mediaDevices.getUserMedia({audio:true});client.current?.call(target,{extra_param:"careflow360"});}catch{setState("error");setMessage("Allow microphone access to make calls");}};
  const answer=async()=>{stopRingtone();try{await navigator.mediaDevices.getUserMedia({audio:true});client.current?.answer();setMessage("Connecting call…");}catch{setState("error");setMessage("Allow microphone access to answer calls");}};
  const reject=()=>{stopRingtone();client.current?.reject()},hangup=()=>client.current?.terminate();
  const toggleMute=()=>{muted?client.current?.unMute():client.current?.mute();setMuted(!muted);};
  const toggleHold=()=>{held?client.current?.unHold():client.current?.hold();setHeld(!held);};
  const transfer=()=>{const target=transferTo.replace(/\D/g,"");if(!target)return;client.current?.transfer(target,response=>setMessage(response?.error?`Transfer failed: ${response.error}`:"Transfer started"));};
  const changeAgentStatus=async(status:AgentStatus)=>{setStatusBusy(true);try{if(!connlyClient.current||!connlyConnected.current)throw new Error("Connly presence is not connected");connlyClient.current.setStatus(status);setAgentStatus(status);setMessage(status==="online"?"Softphone ready · Online":status==="break"?"On break · Incoming calls paused":"Offline · Incoming calls paused");await api.post("/integrations/telecmi/status",{status}).catch(error=>console.warn("TeleCMI REST status mirror failed",error));if(state==="error"&&status==="online")setState("ready");}catch(error:any){setMessage(error?.message||"Unable to update Connly agent status");setState("error");}finally{setStatusBusy(false);}};
  if(state==="connecting"&&!open)return <button className="softphone-launch connecting" title={message} onClick={()=>setOpen(true)}><PhoneCall/></button>;
  return <div className={`softphone ${open?"open":""}`}>
    {!open?<button className={state==="incoming"?"softphone-launch ringing":"softphone-launch"} onClick={()=>setOpen(true)}>{state==="incoming"?<PhoneIncoming/>:<PhoneCall/>}<span>{state==="incoming"?incoming?.name||incoming?.from:"Softphone"}</span></button>:<section className="softphone-panel">
      <header><div><small>TELECMI WEB PHONE</small><strong>{message}</strong></div>{state!=="incoming"&&state!=="active"&&state!=="calling"&&<button onClick={()=>setOpen(false)}><X/></button>}</header>
      {state!=="incoming"&&state!=="active"&&state!=="calling"&&<label className="softphone-status">Agent status<select value={agentStatus} disabled={statusBusy||state==="connecting"} onChange={event=>changeAgentStatus(event.target.value as AgentStatus)}><option value="online">Online</option><option value="break">Break</option><option value="offline">Offline</option></select></label>}
      {state==="incoming"?<div className="softphone-incoming"><PhoneIncoming/><b>{incoming?.name||incoming?.from||"Incoming call"}</b>{incoming?.name&&<span>{incoming.from}</span>}<div><button className="answer" onClick={answer}><Phone/>Answer</button><button className="decline" onClick={reject}><PhoneOff/>Reject</button></div></div>:state==="active"||state==="calling"?<div className="softphone-active"><PhoneCall/><b>{state==="active"?"Connected":"Calling"}</b><div><button className={muted?"selected":""} onClick={toggleMute}>{muted?<MicOff/>:<Mic/>}{muted?"Unmute":"Mute"}</button><button className={held?"selected":""} onClick={toggleHold}>{held?<Play/>:<Pause/>}{held?"Resume":"Hold"}</button><button className="decline" onClick={hangup}><PhoneOff/>End</button></div>{state==="active"&&<form className="softphone-transfer" onSubmit={event=>{event.preventDefault();transfer()}}><input value={transferTo} onChange={event=>setTransferTo(event.target.value)} placeholder="Extension or number"/><button>Transfer</button></form>}</div>:<form onSubmit={event=>{event.preventDefault();dial()}}><input value={number} onChange={event=>setNumber(event.target.value)} placeholder="Customer number" inputMode="tel"/><button disabled={state!=="ready"||agentStatus!=="online"}><Phone/>Call</button></form>}
    </section>}
  </div>;
}
