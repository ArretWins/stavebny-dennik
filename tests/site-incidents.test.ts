import {describe,expect,it} from 'vitest';
import {incidentNeedsImmediateAction,unresolvedIncidentAgeHours,validateIncidentResolution,validateSiteIncident} from '../src/domain/siteIncidents';
import type {SiteIncident} from '../src/domain/types';
const incident:SiteIncident={id:'i1',ownerId:'o1',projectId:'p1',reporterName:'Ján',incidentType:'near_miss',severity:'moderate',occurredAt:'2026-08-07T08:00:00.000Z',location:'1. poschodie',description:'Uvoľnený materiál takmer spadol.',status:'reported',syncStatus:'synced',createdAt:'2026-08-07T08:01:00.000Z',updatedAt:'2026-08-07T08:01:00.000Z'};
describe('site incidents',()=>{
  it('validates evidence fields and resolution content',()=>{expect(validateSiteIncident(incident)).toBe('ok');expect(validateSiteIncident({...incident,description:'krátke'})).toBe('description');expect(validateIncidentResolution('Príčina','Zabezpečiť materiál')).toBe(true);expect(validateIncidentResolution('x','Zásah')).toBe(false)});
  it('escalates serious incidents and unresolved reports older than 24 hours',()=>{expect(incidentNeedsImmediateAction({...incident,severity:'serious'},new Date('2026-08-07T09:00:00Z'))).toBe(true);expect(incidentNeedsImmediateAction(incident,new Date('2026-08-08T09:00:00Z'))).toBe(true);expect(incidentNeedsImmediateAction({...incident,status:'resolved'},new Date('2026-08-09T09:00:00Z'))).toBe(false)});
  it('calculates non-negative age',()=>{expect(unresolvedIncidentAgeHours(incident,new Date('2026-08-08T08:00:00Z'))).toBe(24);expect(unresolvedIncidentAgeHours(incident,new Date('2026-08-01T08:00:00Z'))).toBe(0)});
});
