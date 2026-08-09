import { describe, expect, it } from 'vitest';
import { validateWorkerCredential, workerAdmissionSummary, workerCredentialHealth } from '../src/domain/workerCredentials';
import type { ProjectWorker, WorkerCredential } from '../src/domain/types';

const base: WorkerCredential = { id:'c1',ownerId:'o1',projectId:'p1',workerId:'w1',credentialType:'medical_exam',title:'Lekárska prehliadka',expiresAt:'2026-08-20',syncStatus:'synced',createdAt:'2026-01-01',updatedAt:'2026-01-01' };
const worker: ProjectWorker = { id:'w1',ownerId:'o1',projectId:'p1',firstName:'Ján',lastName:'Novák',position:'Murár',status:'active',createdAt:'2026-01-01',updatedAt:'2026-01-01' };

describe('worker credentials',()=>{
  it('distinguishes permanent, valid, expiring, expired and revoked records',()=>{
    expect(workerCredentialHealth({...base,expiresAt:undefined},'2026-08-01')).toBe('permanent');
    expect(workerCredentialHealth({...base,expiresAt:'2026-10-01'},'2026-08-01')).toBe('valid');
    expect(workerCredentialHealth(base,'2026-08-01')).toBe('expiring');
    expect(workerCredentialHealth({...base,expiresAt:'2026-07-31'},'2026-08-01')).toBe('expired');
    expect(workerCredentialHealth({...base,revokedAt:'2026-07-01'},'2026-08-01')).toBe('revoked');
  });
  it('validates chronology and bounded copy',()=>{
    expect(validateWorkerCredential({...base,issuedDate:'2026-08-02',expiresAt:'2026-08-01'})).toBe('dates');
    expect(validateWorkerCredential({...base,title:' '})).toBe('title');
    expect(validateWorkerCredential(base)).toBe('ok');
  });
  it('blocks admission when any credential is expired or revoked',()=>{
    expect(workerAdmissionSummary(worker,[],'2026-08-01')).toMatchObject({admitted:false,total:0});
    expect(workerAdmissionSummary(worker,[base],'2026-08-01')).toMatchObject({admitted:true,expiring:1});
    expect(workerAdmissionSummary(worker,[{...base,expiresAt:'2026-07-01'}],'2026-08-01')).toMatchObject({admitted:false,expired:1});
  });
});
