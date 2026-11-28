/* ============================================================================
   〈눌러〉 단어장 — Service Worker (PWA 오프라인 셸)
   ----------------------------------------------------------------------------
   · 앱 셸(./, index.html, manifest, 아이콘)만 캐시한다. 외부 CDN·폰트·API
     (Datamuse, Gemini 등)는 손대지 않고 그대로 통과시킨다.
   · 페이지(navigate)는 network-first — 새로 배포된 index.html 이 바로 반영된다.
     실패하면 캐시된 셸로 오프라인 폴백.
   · 정적 자산은 stale-while-revalidate — 즉시 응답하고 뒤에서 갱신한다.
   · 새 워커는 skipWaiting() + clients.claim() 으로 대기 없이 교체된다.
   ========================================================================== */

const VERSION = 'v1';
const SHELL_CACHE = 'nulleo-shell-' + VERSION;
const CACHE_PREFIX = 'nulleo-';

/* /word_memory/ 서브경로에서도 깨지지 않도록 모두 SW 위치 기준 상대 경로 */
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-64.png'
];

const OFFLINE_HTML =
  '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>눌러 단어장 — 오프라인</title>' +
  '<style>html,body{height:100%;margin:0;background:#F7F4EE;color:#1F1E1C;' +
  'font-family:-apple-system,BlinkMacSystemFont,"Pretendard",system-ui,sans-serif;' +
  'display:flex;align-items:center;justify-content:center;text-align:center}' +
  '.box{padding:32px}h1{font-size:20px;margin:0 0 10px}p{margin:0;color:#6E6A63;font-size:14px}' +
  'button{margin-top:20px;padding:10px 18px;border:0;border-radius:12px;' +
  'background:#B83B2A;color:#FFFDF9;font-size:14px;font-weight:600}</style></head>' +
  '<body><div class="box"><h1>눌러 단어장</h1>' +
  '<p>지금은 오프라인입니다. 저장된 단어장은 기기에 그대로 있습니다.</p>' +
  '<button onclick="location.reload()">다시 시도</button></div></body></html>';

const scopePath = new URL('./', self.location.href).pathname;

/* ---------------------------------------------------------------- 설치 */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_ASSETS.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && (res.ok || res.type === 'opaque')) {
          await cache.put(url, res.clone());
        }
      } catch (err) {
        /* 개별 자산 실패는 설치를 막지 않는다 */
      }
    }));
    await self.skipWaiting();
  })());
});

/* -------------------------------------------------------------- 활성화 */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

/* ------------------------------------------------------------- 메시지 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* --------------------------------------------------------------- 요청 */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  /* 캐시는 GET 만. POST(예: Gemini 호출) 등은 브라우저 기본 동작에 맡긴다. */
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  /* 외부 CDN·폰트·API 는 캐시에 개입하지 않고 그대로 통과 */
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (!url.pathname.startsWith(scopePath)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

/* ------------------------------------------------ network-first (페이지) */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    /* no-cache: HTTP 캐시를 믿지 않고 매번 조건부 재검증 → 새 배포가 바로 반영 */
    let fresh;
    try {
      fresh = new Request(request, { cache: 'no-cache' });
    } catch (err) {
      fresh = request;
    }
    const response = await fetch(fresh);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached =
      (await cache.match(request)) ||
      (await cache.match('./index.html')) ||
      (await cache.match('./'));
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/* ------------------------------ stale-while-revalidate (정적 자산·아이콘) */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached; /* 즉시 응답, 갱신은 백그라운드 */

  const fresh = await network;
  if (fresh) return fresh;
  return new Response('', { status: 504, statusText: 'Offline' });
}
