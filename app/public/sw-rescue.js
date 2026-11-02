/**
 * Self-healing Service Worker rescue script.
 * Automatically skips waiting and reloads any app.html client tab stuck on the loading skeleton
 * (where main.js failed to boot on a previous broken Service Worker cache), while preserving
 * the non-intrusive update banner when the open client tab is healthy.
 */
const APP_URL_REGEX = /\/app(?:\.html)?(?:[?#]|$)/i;

function checkClientAlive(client, timeoutMs = 600) {
    return new Promise((resolve) => {
        if (typeof MessageChannel === 'undefined') {
            resolve(false);
            return;
        }
        const channel = new MessageChannel();
        const timer = setTimeout(() => {
            resolve(false);
        }, timeoutMs);

        channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve(Boolean(event.data && event.data.alive));
        };

        try {
            client.postMessage({ type: 'SW_HEALTH_CHECK' }, [channel.port2]);
        } catch (_) {
            clearTimeout(timer);
            resolve(false);
        }
    });
}

let shouldRescueDeadClients = false;

self.addEventListener('install', (event) => {
    // Only run rescue logic when updating an already-installed Service Worker, never on first visit
    if (!self.registration || !self.registration.active) return;

    event.waitUntil(
        (async () => {
            await new Promise((r) => setTimeout(r, 1000));
            const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            const appClients = allClients.filter((c) => APP_URL_REGEX.test(c.url));
            if (appClients.length === 0) {
                return;
            }
            const statuses = await Promise.all(appClients.map((c) => checkClientAlive(c, 600)));
            if (statuses.some((alive) => !alive)) {
                shouldRescueDeadClients = true;
                await self.skipWaiting();
            }
        })()
    );
});

self.addEventListener('activate', () => {
    if (!shouldRescueDeadClients) return;
    shouldRescueDeadClients = false;

    // Run outside event.waitUntil so the Service Worker reaches 'activated' state first
    // and can immediately handle the navigation fetch without deadlocking.
    setTimeout(async () => {
        try {
            const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            const appClients = allClients.filter((c) => APP_URL_REGEX.test(c.url));
            for (const client of appClients) {
                const alive = await checkClientAlive(client, 500);
                if (!alive && typeof client.navigate === 'function') {
                    client.navigate(client.url).catch(() => {});
                }
            }
        } catch (_) {
            // Ignore errors on closing tabs
        }
    }, 150);
});
