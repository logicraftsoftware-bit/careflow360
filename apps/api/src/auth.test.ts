import {describe,expect,it} from 'vitest';
import {isAdministrativeAccount} from './modules/auth.js';

describe('login portal classification',()=>{
  it('recognizes a clinic owner by the tenant email even when the legacy role is missing',()=>{
    expect(isAdministrativeAccount({isPlatform:false,email:'OWNER@clinic.com',tenant:{email:'owner@clinic.com'},roles:[]})).toBe(true);
  });

  it('recognizes clinic manager and clinic admin roles',()=>{
    expect(isAdministrativeAccount({isPlatform:false,email:'manager@clinic.com',tenant:{email:'owner@clinic.com'},roles:[{role:{code:'CLINIC_MANAGER'}}]})).toBe(true);
    expect(isAdministrativeAccount({isPlatform:false,email:'admin@clinic.com',tenant:{email:'owner@clinic.com'},roles:[{role:{code:'CLINIC_ADMIN'}}]})).toBe(true);
  });

  it('keeps ordinary staff on the staff portal',()=>{
    expect(isAdministrativeAccount({isPlatform:false,email:'staff@clinic.com',tenant:{email:'owner@clinic.com'},roles:[{role:{code:'CALL_CENTRE'}}]})).toBe(false);
  });
});
