import {describe,expect,it} from 'vitest';
import {assertTenantOwnership,withoutTenantOverride} from './security.js';
describe('tenant isolation',()=>{
  it('allows matching tenant ownership',()=>expect(assertTenantOwnership('tenant-a','tenant-a')).toBe(true));
  it('hides cross-tenant records',()=>expect(()=>assertTenantOwnership('tenant-a','tenant-b')).toThrow('Record not found'));
  it('strips frontend tenant overrides',()=>expect(withoutTenantOverride({tenantId:'tenant-b',name:'Lead'})).toEqual({name:'Lead'}));
});
