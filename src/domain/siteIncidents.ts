import type { SiteIncident } from './types';

export function validateSiteIncident(input: Pick<SiteIncident,'incidentType'|'severity'|'occurredAt'|'location'|'description'|'immediateAction'|'peopleInvolved'>):'ok'|'occurred_at'|'location'|'description'|'too_long'{
  if(!Number.isFinite(Date.parse(input.occurredAt))) return 'occurred_at';
  if(input.location.trim().length<2||input.location.trim().length>160) return 'location';
  if(input.description.trim().length<10||input.description.trim().length>2000) return 'description';
  if((input.immediateAction?.length??0)>1000||(input.peopleInvolved?.length??0)>500) return 'too_long';
  return 'ok';
}

export function validateIncidentResolution(rootCause:string,correctiveAction:string):boolean{return rootCause.trim().length>=5&&rootCause.trim().length<=2000&&correctiveAction.trim().length>=5&&correctiveAction.trim().length<=2000}

export function unresolvedIncidentAgeHours(item:SiteIncident,now=new Date()):number{return Math.max(0,(now.getTime()-Date.parse(item.occurredAt))/3_600_000)}

export function incidentNeedsImmediateAction(item:SiteIncident,now=new Date()):boolean{return item.status!=='resolved'&&(item.severity==='critical'||item.severity==='serious'||unresolvedIncidentAgeHours(item,now)>=24)}
