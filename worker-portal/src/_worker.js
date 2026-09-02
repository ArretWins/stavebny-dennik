const upstreamShareUrl =
  'https://fjhgeudmcrbjpnduwhtb.supabase.co/functions/v1/project-share';
const upstreamSupplierQuoteUrl =
  'https://fjhgeudmcrbjpnduwhtb.supabase.co/functions/v1/supplier-quote';
const legacyPublicHostname = 'stavebny-dennik-worker.pages.dev';
const primaryPublicOrigin = 'https://stavuno.pages.dev';

const htmlHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy':
    "default-src 'none'; img-src https://*.supabase.co data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Permissions-Policy':
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

function unavailablePage() {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Odkaz už nie je dostupný</title><style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f0e7;
  color:#17231f;font:16px/1.55 "Segoe UI",sans-serif;padding:24px}
  main{max-width:520px;background:#fff;border:1px solid #d7d0c1;padding:32px;
  box-shadow:8px 8px 0 #173f35}h1{font:700 30px/1.1 Georgia,serif;margin:0 0 16px}
  p{margin:0;color:#5f6863}</style></head><body><main>
  <h1>Odkaz už nie je dostupný</h1>
  <p>Platnosť odkazu skončila alebo ho majster odvolal. Požiadajte ho o nový odkaz.</p>
  </main></body></html>`;
}

async function proxyPrivatePage(request, upstreamUrl) {
  if (!['GET', 'POST'].includes(request.method))
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, POST' },
    });
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{64}$/.test(token))
    return new Response(unavailablePage(), {
      status: 404,
      headers: htmlHeaders,
    });
  try {
    const upstream = new URL(upstreamUrl);
    upstream.searchParams.set('token', token);
    const result = new URL(request.url).searchParams.get('result');
    if (result) upstream.searchParams.set('result', result);
    upstream.searchParams.set('view', crypto.randomUUID());
    const response = await fetch(upstream, {
      method: request.method,
      body: request.method === 'POST' ? request.body : undefined,
      redirect: 'manual',
      headers: {
        'Cache-Control': 'no-cache',
        ...(request.method === 'POST'
          ? { 'Content-Type': request.headers.get('Content-Type') || '' }
          : {}),
      },
    });
    if (response.status === 303) {
      const location = response.headers.get('Location') || `?token=${token}`;
      return new Response(null, {
        status: 303,
        headers: { ...htmlHeaders, Location: location },
      });
    }
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: htmlHeaders,
    });
  } catch {
    return new Response(unavailablePage(), {
      status: 502,
      headers: htmlHeaders,
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === legacyPublicHostname) {
      const destination = new URL(`${url.pathname}${url.search}`, primaryPublicOrigin);
      return Response.redirect(destination, 308);
    }
    if (url.pathname === '/client-share')
      return proxyPrivatePage(request, upstreamShareUrl);
    if (url.pathname === '/supplier-quote')
      return proxyPrivatePage(request, upstreamSupplierQuoteUrl);
    if (url.pathname === '/reset-password' || url.pathname === '/reset-password.html') {
      const assetUrl = new URL('/reset-password.html', url);
      const response = await env.ASSETS.fetch(new Request(assetUrl, request));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'private, no-store, max-age=0');
      headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      return new Response(response.body, { status: response.status, headers });
    }
    if (url.pathname === '/' && url.searchParams.has('token')) {
      const invitedWorkerUrl = new URL('/worker/', url);
      invitedWorkerUrl.search = url.search;
      return env.ASSETS.fetch(new Request(invitedWorkerUrl, request));
    }
    if (url.pathname === '/' && !url.searchParams.has('token')) {
      const landingUrl = new URL('/download', url);
      return env.ASSETS.fetch(new Request(landingUrl, request));
    }
    if (url.pathname === '/worker') {
      return Response.redirect(new URL(`/worker/${url.search}`, url), 308);
    }
    return env.ASSETS.fetch(request);
  },
};
