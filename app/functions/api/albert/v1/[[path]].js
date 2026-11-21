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
const ALLOWED_METHODS_BY_ENDPOINT = Object.freeze({
    models: 'GET',
    me: 'GET',
    'chat/completions': 'POST',
});
const MAX_POST_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 45_000;
const JSON_CONTENT_TYPE_RE = /^application\/json(?:\s*;.*)?$/i;

function jsonResponse(body, status, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...extraHeaders,
        },
    });
}

async function readBoundedBody(request, maxBytes) {
    if (!request.body) return '';

    if (typeof request.body.getReader !== 'function') {
        const buffer = await request.arrayBuffer();
        if (buffer.byteLength > maxBytes) {
            return null;
        }
        return new TextDecoder().decode(buffer);
    }

    const reader = request.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel().catch(() => {});
                return null;
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock?.();
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(combined);
}

export async function onRequest(context) {
    const { request, params } = context;
    const method = request.method.toUpperCase();
    const selfOrigin = new URL(request.url).origin;

    if (method === 'OPTIONS') {
        const reqOrigin = (request.headers.get('Origin') || '').trim();
        if (reqOrigin && reqOrigin !== selfOrigin) {
            return jsonResponse({ error: { message: 'Origine non autorisée' } }, 403, { Vary: 'Origin' });
        }

        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': selfOrigin,
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Max-Age': '86400',
                'Vary': 'Origin',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    }

    if (method !== 'GET' && method !== 'POST') {
        return jsonResponse(
            { error: { message: 'Method Not Allowed' } },
            405,
            { Allow: 'GET, POST, OPTIONS' }
        );
    }

    const pathSegments = Array.isArray(params?.path)
        ? params.path
        : typeof params?.path === 'string'
            ? [params.path]
            : [];
    const subPath = pathSegments.join('/');

    if (!Object.prototype.hasOwnProperty.call(ALLOWED_METHODS_BY_ENDPOINT, subPath)) {
        return jsonResponse({ error: { message: 'Endpoint Albert non autorisé' } }, 404);
    }

    const expectedMethod = ALLOWED_METHODS_BY_ENDPOINT[subPath];
    if (expectedMethod !== method) {
        return jsonResponse(
            { error: { message: 'Méthode non autorisée pour cet endpoint' } },
            405,
            { Allow: `${expectedMethod}, OPTIONS` }
        );
    }

    const secFetchSite = (request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
    const origin = (request.headers.get('Origin') || '').trim();
    const referer = (request.headers.get('Referer') || '').trim();

    if ((origin && origin !== selfOrigin) || (secFetchSite && secFetchSite !== 'same-origin')) {
        return jsonResponse({ error: { message: 'Requête cross-origin non autorisée' } }, 403);
    }

    const isSameOrigin = method === 'GET'
        ? (
            secFetchSite === 'same-origin' ||
            origin === selfOrigin ||
            referer === selfOrigin ||
            referer.startsWith(`${selfOrigin}/`)
        )
        : (secFetchSite === 'same-origin' || origin === selfOrigin);

    if (!isSameOrigin) {
        return jsonResponse({ error: { message: 'Requête cross-origin non autorisée' } }, 403);
    }

    const authHeader = (request.headers.get('Authorization') || '').trim();
    if (!/^Bearer\s+\S+$/i.test(authHeader)) {
        return jsonResponse({ error: { message: 'En-tête Authorization Bearer requis' } }, 401);
    }

    const upstreamHeaders = new Headers({
        Authorization: authHeader,
    });

    const init = {
        method,
        headers: upstreamHeaders,
    };

    if (method === 'POST') {
        const contentType = (request.headers.get('Content-Type') || '').trim();
        if (!JSON_CONTENT_TYPE_RE.test(contentType)) {
            return jsonResponse({ error: { message: 'Content-Type application/json requis' } }, 415);
        }
        upstreamHeaders.set('Content-Type', 'application/json');

        const contentLengthRaw = request.headers.get('Content-Length');
        if (contentLengthRaw !== null) {
            const contentLength = Number(contentLengthRaw);
            if (Number.isFinite(contentLength) && contentLength > MAX_POST_BODY_BYTES) {
                return jsonResponse({ error: { message: 'Corps de requête trop volumineux' } }, 413);
            }
        }

        const boundedBody = await readBoundedBody(request, MAX_POST_BODY_BYTES);
        if (boundedBody === null) {
            return jsonResponse({ error: { message: 'Corps de requête trop volumineux' } }, 413);
        }
        init.body = boundedBody;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort(new DOMException('Upstream request timeout', 'TimeoutError'));
    }, UPSTREAM_TIMEOUT_MS);

    try {
        const upstreamResponse = await fetch(`${ALBERT_UPSTREAM_BASE}/${subPath}`, {
            ...init,
            signal: controller.signal,
        });

        const upstreamContentType = (upstreamResponse.headers.get('Content-Type') || '').trim();
        if (upstreamContentType && !JSON_CONTENT_TYPE_RE.test(upstreamContentType)) {
            await upstreamResponse.body?.cancel?.().catch(() => {});
            return jsonResponse(
                { error: { message: "Réponse non-JSON reçue d'Albert API." } },
                upstreamResponse.status >= 400 ? upstreamResponse.status : 502
            );
        }

        const responseHeaders = new Headers({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        });

        for (const headerName of ['retry-after', 'x-ratelimit-reset', 'x-ratelimit-reset-requests']) {
            const val = upstreamResponse.headers.get(headerName);
            if (val) {
                responseHeaders.set(headerName, val);
            }
        }

        return new Response(upstreamResponse.body, {
            status: upstreamResponse.status,
            headers: responseHeaders,
        });
    } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
            return jsonResponse(
                { error: { message: 'Délai dépassé lors de la communication avec Albert API (Etalab).' } },
                504
            );
        }
        return jsonResponse(
            { error: { message: 'Impossible de joindre le serveur Albert API (Etalab).' } },
            502
        );
    } finally {
        clearTimeout(timeoutId);
    }
}
