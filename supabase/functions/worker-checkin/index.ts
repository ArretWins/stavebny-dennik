import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
async function sha256(value: string): Promise<string> { const bytes = new TextEncoder().encode(value); const hash = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method === 'GET') {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const html = `<!doctype html><html lang="sk"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Príchod na stavbu</title><style>body{font:16px Arial,sans-serif;background:#f8f5ef;padding:24px;color:#111827}main{max-width:420px;margin:40px auto;background:white;border:1px solid #e0ded9;border-radius:12px;padding:20px}input,button{box-sizing:border-box;width:100%;min-height:50px;border-radius:10px;padding:12px;font-size:16px}input{border:1px solid #e0ded9;margin:12px 0}button{border:0;background:#2e7d32;color:white;font-weight:700}h1{font-size:24px}</style><main><h1>Príchod na stavbu</h1><p>Zadajte meno a potvrďte príchod.</p><input id="name" placeholder="Meno a priezvisko" autocomplete="name"><button id="submit">Potvrdiť príchod</button><p id="message"></p></main><script>document.getElementById('submit').onclick=async()=>{const name=document.getElementById('name').value.trim();const message=document.getElementById('message');if(!name){message.textContent='Zadajte meno.';return}const response=await fetch(location.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:${JSON.stringify(token)},workerName:name})});message.textContent=response.ok?'Príchod bol zaznamenaný.':'QR kód je neplatný alebo jeho platnosť skončila.'}</script></html>`;
    return new Response(html, { status: 200, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' } });
  }
  try {
    const body = await request.json(); const token = typeof body.token === 'string' ? body.token : ''; const workerName = typeof body.workerName === 'string' ? body.workerName.trim() : '';
    if (!token || !workerName || workerName.length > 120) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: scopedToken, error: tokenError } = await admin.from('checkin_tokens').select('id, project_id, checkin_date, expires_at, action').eq('token_hash', await sha256(token)).eq('action', 'checkin').gt('expires_at', new Date().toISOString()).maybeSingle();
    if (tokenError || !scopedToken) return new Response(JSON.stringify({ error: 'invalid_or_expired_token' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const id = crypto.randomUUID(); const { error: insertError } = await admin.from('worker_checkins').insert({ id, project_id: scopedToken.project_id, worker_name: workerName, checked_in_at: new Date().toISOString() });
    if (insertError) throw insertError;
    return new Response(JSON.stringify({ id, projectId: scopedToken.project_id }), { status: 201, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'server_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }); }
});
