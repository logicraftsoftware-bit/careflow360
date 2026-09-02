import { describe, expect, it } from 'vitest';
import { renderAppointmentSlip } from './modules/public.js';

describe('appointment token slip',()=>{
  it('renders a PNG using the bundled fonts',()=>{
    const png=renderAppointmentSlip({
      startsAt:new Date('2026-09-04T03:30:00.000Z'),
      token:'SM-GENER/4-09/01',
      tenant:{name:'Demo Clinic',mobile:'9876543210',address:'Kolkata',logoUrl:null},
      patient:{name:'Dwaipayan Bhattacharya'},
      doctor:{name:'Dr. S. Mukherjee',qualification:'MBBS, MD'},
      department:{name:'General Medicine'},
    });
    expect(Buffer.from(png).subarray(1,4).toString()).toBe('PNG');
    expect(png.byteLength).toBeGreaterThan(20_000);
  });
});
