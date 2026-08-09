import type { ProjectWorker, WorkerCredential } from './types';

export type WorkerCredentialHealth = 'valid' | 'expiring' | 'expired' | 'permanent' | 'revoked';

export function validateWorkerCredential(input: Pick<WorkerCredential, 'title' | 'credentialType' | 'issuedDate' | 'expiresAt' | 'documentNumber' | 'issuer' | 'note'>): 'ok' | 'title' | 'dates' | 'too_long' {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 120) return 'title';
  if ((input.documentNumber?.length ?? 0) > 100 || (input.issuer?.length ?? 0) > 160 || (input.note?.length ?? 0) > 500) return 'too_long';
  if (input.issuedDate && input.expiresAt && input.expiresAt < input.issuedDate) return 'dates';
  return 'ok';
}

export function workerCredentialHealth(credential: WorkerCredential, today: string, warningDays = 30): WorkerCredentialHealth {
  if (credential.revokedAt) return 'revoked';
  if (!credential.expiresAt) return 'permanent';
  if (credential.expiresAt < today) return 'expired';
  const warning = new Date(`${today}T12:00:00Z`);
  warning.setUTCDate(warning.getUTCDate() + warningDays);
  return credential.expiresAt <= warning.toISOString().slice(0, 10) ? 'expiring' : 'valid';
}

export function workerAdmissionSummary(worker: ProjectWorker, credentials: WorkerCredential[], today: string) {
  const own = credentials.filter(item => item.workerId === worker.id);
  const health = own.map(item => workerCredentialHealth(item, today));
  return {
    total: own.length,
    expired: health.filter(item => item === 'expired').length,
    expiring: health.filter(item => item === 'expiring').length,
    revoked: health.filter(item => item === 'revoked').length,
    admitted: worker.status === 'active' && own.length > 0 && !health.some(item => item === 'expired' || item === 'revoked'),
  };
}
