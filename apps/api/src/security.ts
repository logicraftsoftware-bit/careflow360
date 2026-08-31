import { AppError } from './lib.js';
/** Prevents object IDs or payload fields from changing authenticated tenant scope. */
export function assertTenantOwnership(authenticatedTenantId:string, recordTenantId:string){
  if(authenticatedTenantId!==recordTenantId) throw new AppError(404,'Record not found','NOT_FOUND');
  return true;
}
export function withoutTenantOverride<T extends Record<string,unknown>>(payload:T){
  const safe={...payload}; delete safe.tenantId; return safe;
}
