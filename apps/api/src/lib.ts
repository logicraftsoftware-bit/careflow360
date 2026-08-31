import { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
export const prisma = new PrismaClient();
export class AppError extends Error { constructor(public status:number, message:string, public code='ERROR', public errors:unknown[]=[]){super(message)} }
export type AuthRequest=Request & { user?:{id:string;tenantId:string|null;isPlatform:boolean;permissions:string[]} };
export const asyncRoute=(fn:(req:AuthRequest,res:Response,next:NextFunction)=>Promise<unknown>)=>(req:AuthRequest,res:Response,next:NextFunction)=>Promise.resolve(fn(req,res,next)).catch(next);
export const ok=(res:Response,data:unknown,message='Success',status=200)=>res.status(status).json({success:true,message,data});
export function auth(req:AuthRequest,_res:Response,next:NextFunction){
  const token=req.headers.authorization?.replace(/^Bearer /,''); if(!token) return next(new AppError(401,'Authentication required','UNAUTHENTICATED'));
  try { req.user=jwt.verify(token,config.JWT_SECRET) as AuthRequest['user']; next(); } catch { next(new AppError(401,'Session expired','INVALID_TOKEN')); }
}
export const platformOnly=(req:AuthRequest,_res:Response,next:NextFunction)=>req.user?.isPlatform?next():next(new AppError(403,'Platform access required','FORBIDDEN'));
export const tenantId=(req:AuthRequest)=>{if(!req.user?.tenantId) throw new AppError(403,'Tenant context required','TENANT_REQUIRED'); return req.user.tenantId};
export const audit=async(req:AuthRequest,action:string,entityType:string,entityId?:string,metadata?:object)=>prisma.auditLog.create({data:{tenantId:req.user?.tenantId,actorId:req.user?.id,action,entityType,entityId,metadata,ipAddress:req.ip}});
