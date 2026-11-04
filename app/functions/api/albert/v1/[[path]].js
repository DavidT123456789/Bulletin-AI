/**
 * @fileoverview Relais Cloudflare Pages Function sans état (stateless pass-through)
 * vers la passerelle gouvernementale souveraine Albert API (Gouv.fr / https://albert.api.etalab.gouv.fr/v1).
 *
 * Raison d'être :
 * Le serveur OpenGateLLM d'Etalab ne renvoie pas les en-têtes CORS (Access-Control-Allow-Origin)
 * requis par les navigateurs lors des requêtes cross-origin avec en-tête Authorization.
 * Ce relais s'exécute en même origine (/api/albert/v1/*) sur Cloudflare Pages, sans aucun
 * stockage, cache ni journalisation des clés API ou des prompts déjà pseudonymisés côté client.
 */

const ALBERT_UPSTREAM_BASE = 'https://albert.api.etalab.gouv.fr/v1';
const ALLOWED_ENDPOINTS = new Set(['models', 'me', 'chat/completions']);

export async function onRequest(context) {
    const { request, params } = context;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': new URL(request.url).origin,
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    if (method !== 'GET' && method !== 'POST') {
        return new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const pathSegments = Array.isArray(params?.path)
        ? params.path
        : typeof params?.path === 'string'
            ? [params.path]
            : [];
    const subPath = pathSegments.join('/');

    if (!ALLOWED_ENDPOINTS.has(subPath)) {
        return new Response(JSON.stringify({ error: { message: 'Endpoint Albert non autorisé' } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const upstreamHeaders = new Headers();
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        upstreamHeaders.set('Authorization', authHeader);
    }
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        upstreamHeaders.set('Content-Type', contentType);
    }

    const init = {
        method,
        headers: upstreamHeaders,
    };

    if (method === 'POST') {
        init.body = await request.text();
    }

    try {
        const upstreamResponse = await fetch(`${ALBERT_UPSTREAM_BASE}/${subPath}`, init);
        const responseHeaders = new Headers({
            'Content-Type': upstreamResponse.headers.get('Content-Type') || 'application/json',
            'Cache-Control': 'no-store',
        });

        for (const headerName of ['retry-after', 'x-ratelimit-reset', 'x-ratelimit-reset-requests']) {
            const val = upstreamResponse.headers.get(headerName);
            if (val) {
                responseHeaders.set(headerName, val);
            }
        }

        return new Response(upstreamResponse.body, {
            status: upstreamResponse.status,
            statusText: upstreamResponse.statusText,
            headers: responseHeaders,
        });
    } catch {
        return new Response(
            JSON.stringify({ error: { message: 'Impossible de joindre le serveur Albert API (Etalab).' } }),
            {
                status: 502,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            }
        );
    }
}
