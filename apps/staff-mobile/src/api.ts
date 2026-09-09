import AsyncStorage from "@react-native-async-storage/async-storage";
import {API_BASE_URL} from "./config";
const base=API_BASE_URL.replace(/\/$/,"");
export async function request(path:string,options:RequestInit={}){const token=await AsyncStorage.getItem("accessToken"),response=await fetch(`${base}${path}`,{...options,headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})},body:responseBody(options.body)});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.message||"Request failed");return json.data}
const responseBody=(body:RequestInit["body"])=>(body && typeof body!=="string" ? JSON.stringify(body) : body);
export async function login(email:string,password:string,portal:"ADMIN"|"STAFF"){const data=await request("/auth/login",{method:"POST",body:JSON.stringify({email,password,portal})});await Promise.all([AsyncStorage.setItem("accessToken",data.accessToken),AsyncStorage.setItem("refreshToken",data.refreshToken),AsyncStorage.setItem("user",JSON.stringify({...data.user,portal}))]);return {...data.user,portal}}
export const clearSession=()=>Promise.all(["accessToken","refreshToken","user"].map(key=>AsyncStorage.removeItem(key)));
