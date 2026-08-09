import type { WorkerCredential, WorkerCredentialEvent, WorkerCredentialEventType, WorkerCredentialType } from '@/domain/types';
import { supabase } from './supabase';

function credentialFromRow(row: Record<string, unknown>): WorkerCredential {
  return { id:String(row.id),ownerId:String(row.owner_id),projectId:String(row.project_id),workerId:String(row.worker_id),credentialType:row.credential_type as WorkerCredentialType,title:String(row.title),documentNumber:row.document_number?String(row.document_number):undefined,issuer:row.issuer?String(row.issuer):undefined,issuedDate:row.issued_date?String(row.issued_date):undefined,expiresAt:row.expires_at?String(row.expires_at):undefined,note:row.note?String(row.note):undefined,attachmentId:row.attachment_id?String(row.attachment_id):undefined,revokedAt:row.revoked_at?String(row.revoked_at):undefined,revokedBy:row.revoked_by?String(row.revoked_by):undefined,revokeReason:row.revoke_reason?String(row.revoke_reason):undefined,syncStatus:'synced',createdAt:String(row.created_at),updatedAt:String(row.updated_at) };
}

function eventFromRow(row: Record<string, unknown>): WorkerCredentialEvent {
  return { id:String(row.id),ownerId:String(row.owner_id),projectId:String(row.project_id),credentialId:String(row.credential_id),workerId:String(row.worker_id),eventType:row.event_type as WorkerCredentialEventType,body:row.body?String(row.body):undefined,metadata:(row.metadata??{}) as WorkerCredentialEvent['metadata'],actorUserId:row.actor_user_id?String(row.actor_user_id):undefined,createdAt:String(row.created_at) };
}

export async function listProjectWorkerCredentials(projectId:string):Promise<{credentials:WorkerCredential[];events:WorkerCredentialEvent[]}> {
  if(!supabase) return {credentials:[],events:[]};
  const [credentialResult,eventResult]=await Promise.all([supabase.from('worker_credentials').select('*').eq('project_id',projectId).order('created_at',{ascending:false}),supabase.from('worker_credential_events').select('*').eq('project_id',projectId).order('created_at',{ascending:true})]);
  if(credentialResult.error) throw credentialResult.error; if(eventResult.error) throw eventResult.error;
  return {credentials:(credentialResult.data??[]).map(credentialFromRow),events:(eventResult.data??[]).map(eventFromRow)};
}

export async function saveRemoteWorkerCredential(item:WorkerCredential):Promise<WorkerCredential> {
  if(!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const {data,error}=await supabase.rpc('save_worker_credential',{p_id:item.id,p_project_id:item.projectId,p_worker_id:item.workerId,p_credential_type:item.credentialType,p_title:item.title,p_document_number:item.documentNumber??null,p_issuer:item.issuer??null,p_issued_date:item.issuedDate??null,p_expires_at:item.expiresAt??null,p_note:item.note??null,p_attachment_id:item.attachmentId??null});
  if(error) throw error; return credentialFromRow(data);
}

export async function revokeRemoteWorkerCredential(id:string,reason:string):Promise<WorkerCredential> {
  if(!supabase) throw new Error('SUPABASE_NOT_CONFIGURED'); const {data,error}=await supabase.rpc('revoke_worker_credential',{p_credential_id:id,p_reason:reason,p_confirmed:true}); if(error) throw error; return credentialFromRow(data);
}

export async function restoreRemoteWorkerCredential(id:string,reason:string):Promise<WorkerCredential> {
  if(!supabase) throw new Error('SUPABASE_NOT_CONFIGURED'); const {data,error}=await supabase.rpc('restore_worker_credential',{p_credential_id:id,p_reason:reason,p_confirmed:true}); if(error) throw error; return credentialFromRow(data);
}
