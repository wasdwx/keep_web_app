const DEFAULT_ROUTE_PROJECT_KEY = 'default-route-project';
const ADMIN_COOKIE_NAME = 'keep_admin';
const SITE_COOKIE_NAME = 'keep_site';
const DEFAULT_QWEATHER_API_HOST = 'https://api.qweather.com';
const WEATHER_RATE_LIMIT_MINUTE = 5;
const WEATHER_RATE_LIMIT_DAY = 700;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get('cookie') ?? '';
  return cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? '';
}

async function sha256Hex(value) {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getAdminToken(env) {
  const password = env.ADMIN_PASSWORD || env.APP_PASSWORD || '';
  if (!password) {
    return null;
  }
  return `v1.${await sha256Hex(password)}`;
}

async function getSiteToken(env) {
  const password = env.APP_PASSWORD || '';
  if (!password) {
    return null;
  }
  return `v1.${await sha256Hex(password)}`;
}

async function isAdminRequest(request, env) {
  const token = await getAdminToken(env);
  if (!token) {
    return false;
  }
  return getCookie(request, ADMIN_COOKIE_NAME) === token;
}

async function isSiteRequest(request, env) {
  const token = await getSiteToken(env);
  if (!token) {
    return true;
  }
  return getCookie(request, SITE_COOKIE_NAME) === token;
}

function cookieOptions(request) {
  const secureCookie = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secureCookie}`;
}

function loginPage(message = '') {
  const escaped = String(message).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));

  return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Keep Web App 登录</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef2f8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827}
    form{width:min(360px,calc(100vw - 32px));display:grid;gap:14px;padding:28px;border-radius:24px;background:#fff;box-shadow:0 20px 60px rgba(15,23,42,.16)}
    h1{margin:0;font-size:22px}
    p{margin:0;color:#6b7280;line-height:1.6}
    input,button{font:inherit;border-radius:14px;padding:13px 14px}
    input{border:1px solid rgba(15,23,42,.16)}
    button{border:0;background:#18c98b;color:#fff;font-weight:700;cursor:pointer}
    .error{color:#b91c1c;background:rgba(239,68,68,.1);padding:10px 12px;border-radius:14px}
  </style>
</head>
<body>
  <form method="post" action="/api/login">
    <h1>访问密码</h1>
    <p>此站点已启用访问密码，请输入密码继续。</p>
    ${escaped ? `<div class="error">${escaped}</div>` : ''}
    <input name="password" type="password" autocomplete="current-password" autofocus />
    <button type="submit">登录</button>
  </form>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

async function readPasswordFromRequest(request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return body.password ?? '';
  }
  const text = await request.text();
  return new URLSearchParams(text).get('password') ?? '';
}

async function handleSiteLogin(request, env) {
  const token = await getSiteToken(env);
  if (!token) {
    return jsonResponse({ ok: true, disabled: true });
  }

  const password = await readPasswordFromRequest(request);
  if (password !== env.APP_PASSWORD) {
    const accept = request.headers.get('accept') ?? '';
    if (accept.includes('text/html')) {
      return loginPage('密码错误，请重试。');
    }
    return jsonResponse({ ok: false, error: 'invalid password' }, { status: 401 });
  }

  const accept = request.headers.get('accept') ?? '';
  const headers = {
    'set-cookie': `${SITE_COOKIE_NAME}=${token}; ${cookieOptions(request)}; Max-Age=2592000`,
  };
  if (accept.includes('text/html')) {
    return new Response(null, { status: 303, headers: { ...headers, location: '/' } });
  }
  return jsonResponse({ ok: true }, { headers });
}

function handleSiteLogout(request) {
  const headers = {
    'set-cookie': `${SITE_COOKIE_NAME}=; ${cookieOptions(request)}; Max-Age=0`,
    location: '/',
  };
  return new Response(null, { status: 303, headers });
}

function validateRouteProjectPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'payload must be an object';
  }
  if (Number(payload.version) < 3) {
    return 'route project version must be >= 3';
  }
  const hasPosterRoute = Array.isArray(payload.posterOutput?.routeLayer?.points)
    && payload.posterOutput.routeLayer.points.length >= 2;
  const hasPreviewRoute = Array.isArray(payload.routePreview?.points)
    && payload.routePreview.points.length >= 2;
  const hasMapImage = typeof payload.posterOutput?.mapImageDataUrl === 'string'
    || typeof payload.background?.dataUrl === 'string';

  if (!hasPosterRoute && !hasPreviewRoute) {
    return 'route project must include routeLayer.points or routePreview.points';
  }
  if (!hasMapImage) {
    return 'route project must include posterOutput.mapImageDataUrl or background.dataUrl';
  }
  return null;
}

function formatDateInShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatMinuteInShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = values.hour === '24' ? '00' : values.hour;
  return `${values.year}-${values.month}-${values.day}T${hour}:${values.minute}`;
}

function daysBetween(dateA, dateB) {
  const a = Date.parse(`${dateA}T00:00:00+08:00`);
  const b = Date.parse(`${dateB}T00:00:00+08:00`);
  return Math.round((b - a) / 86400000);
}

function normalizeApiHost(host) {
  const value = (host || DEFAULT_QWEATHER_API_HOST).replace(/\/+$/, '');
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

function createQweatherHeaders(env) {
  const headers = {
    accept: 'application/json',
  };
  const authType = String(env.QWEATHER_AUTH_TYPE || '').toLowerCase();
  const credential = String(env.QWEATHER_API_KEY || '');
  if (authType === 'jwt' || (!authType && credential.split('.').length >= 3)) {
    headers.authorization = `Bearer ${credential}`;
  } else {
    headers['X-QW-Api-Key'] = credential;
  }
  return headers;
}

async function checkWeatherRateLimit(env) {
  if (!env.DEFAULTS_KV) {
    return { ok: true, skipped: true };
  }

  const now = new Date();
  const dayKey = `weather-rate:day:${formatDateInShanghai(now)}`;
  const minuteKey = `weather-rate:minute:${formatMinuteInShanghai(now)}`;
  const [dayRaw, minuteRaw] = await Promise.all([
    env.DEFAULTS_KV.get(dayKey),
    env.DEFAULTS_KV.get(minuteKey),
  ]);
  const dayCount = Number.parseInt(dayRaw || '0', 10) || 0;
  const minuteCount = Number.parseInt(minuteRaw || '0', 10) || 0;

  if (minuteCount >= WEATHER_RATE_LIMIT_MINUTE) {
    return {
      ok: false,
      scope: 'minute',
      limit: WEATHER_RATE_LIMIT_MINUTE,
      count: minuteCount,
      retryAfter: 60,
    };
  }
  if (dayCount >= WEATHER_RATE_LIMIT_DAY) {
    return {
      ok: false,
      scope: 'day',
      limit: WEATHER_RATE_LIMIT_DAY,
      count: dayCount,
      retryAfter: 86400,
    };
  }

  await Promise.all([
    env.DEFAULTS_KV.put(minuteKey, String(minuteCount + 1), { expirationTtl: 120 }),
    env.DEFAULTS_KV.put(dayKey, String(dayCount + 1), { expirationTtl: 172800 }),
  ]);

  return {
    ok: true,
    minute: { limit: WEATHER_RATE_LIMIT_MINUTE, remaining: WEATHER_RATE_LIMIT_MINUTE - minuteCount - 1 },
    day: { limit: WEATHER_RATE_LIMIT_DAY, remaining: WEATHER_RATE_LIMIT_DAY - dayCount - 1 },
  };
}

async function qweatherFetch(env, path, params) {
  const host = normalizeApiHost(env.QWEATHER_API_HOST);
  const url = new URL(`${host}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  const response = await fetch(url, {
    headers: createQweatherHeaders(env),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code !== '200') {
    throw new Error(body.code ? `QWeather error: ${body.code}` : `QWeather HTTP ${response.status}`);
  }
  return body;
}

async function handleWeather(request, env) {
  if (!env.QWEATHER_API_KEY) {
    return jsonResponse({ ok: false, error: 'QWEATHER_API_KEY is not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const city = url.searchParams.get('city') || '北京市';
  const date = url.searchParams.get('date') || formatDateInShanghai();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ ok: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  const today = formatDateInShanghai();
  const offset = daysBetween(today, date);
  if (offset < 0) {
    return jsonResponse({ ok: false, error: 'past weather is not supported' }, { status: 400 });
  }
  if (offset > 7) {
    return jsonResponse({ ok: false, error: 'only today and next 7 days are supported' }, { status: 400 });
  }

  const rateLimit = await checkWeatherRateLimit(env);
  if (!rateLimit.ok) {
    return jsonResponse({
      ok: false,
      error: `weather api rate limit exceeded: ${rateLimit.scope}`,
      rateLimit,
    }, {
      status: 429,
      headers: {
        'retry-after': String(rateLimit.retryAfter),
      },
    });
  }

  try {
    const geo = await qweatherFetch(env, '/geo/v2/city/lookup', {
      location: city,
      range: 'cn',
      number: '1',
      lang: 'zh',
    });
    const location = geo.location?.[0];
    if (!location?.id) {
      return jsonResponse({ ok: false, error: 'city not found' }, { status: 404 });
    }

    if (offset === 0) {
      const weather = await qweatherFetch(env, '/v7/weather/now', {
        location: location.id,
        lang: 'zh',
        unit: 'm',
      });
      return jsonResponse({
        ok: true,
        source: 'now',
        city: location.name,
        locationId: location.id,
        weather: weather.now?.text ?? '',
        temperature: weather.now?.temp ? `${weather.now.temp}°C` : '',
        raw: {
          updateTime: weather.updateTime,
          obsTime: weather.now?.obsTime,
        },
      });
    }

    const forecast = await qweatherFetch(env, '/v7/weather/7d', {
      location: location.id,
      lang: 'zh',
      unit: 'm',
    });
    const day = forecast.daily?.find((item) => item.fxDate === date);
    if (!day) {
      return jsonResponse({ ok: false, error: 'forecast date not found' }, { status: 404 });
    }
    const tempMax = Number(day.tempMax);
    const tempMin = Number(day.tempMin);
    const temp = Number.isFinite(tempMax) && Number.isFinite(tempMin)
      ? Math.round((tempMax + tempMin) / 2)
      : day.tempMax;
    return jsonResponse({
      ok: true,
      source: 'forecast',
      city: location.name,
      locationId: location.id,
      weather: day.textDay || day.textNight || '',
      temperature: temp !== undefined && temp !== '' ? `${temp}°C` : '',
      raw: { fxDate: day.fxDate },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'weather fetch failed' }, { status: 502 });
  }
}

async function handleAdminLogin(request, env) {
  const token = await getAdminToken(env);
  if (!token) {
    return jsonResponse({ ok: false, error: 'ADMIN_PASSWORD is not configured' }, { status: 503 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid json body' }, { status: 400 });
  }

  const expected = env.ADMIN_PASSWORD || env.APP_PASSWORD || '';
  if (body.password !== expected) {
    return jsonResponse({ ok: false, error: 'invalid password' }, { status: 401 });
  }

  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
  });
  headers.append('set-cookie', `${ADMIN_COOKIE_NAME}=${token}; ${cookieOptions(request)}; Max-Age=2592000`);

  const siteToken = await getSiteToken(env);
  if (siteToken) {
    headers.append('set-cookie', `${SITE_COOKIE_NAME}=${siteToken}; ${cookieOptions(request)}; Max-Age=2592000`);
  }

  return new Response(JSON.stringify({ ok: true }), { headers });
}

async function handleGetDefaultProject(env) {
  if (!env.DEFAULTS_KV) {
    return jsonResponse({ configured: false, error: 'DEFAULTS_KV is not configured' }, { status: 404 });
  }

  const text = await env.DEFAULTS_KV.get(DEFAULT_ROUTE_PROJECT_KEY);
  if (!text) {
    return jsonResponse({ configured: false }, { status: 404 });
  }

  return new Response(text, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function handlePutDefaultProject(request, env) {
  if (!env.DEFAULTS_KV) {
    return jsonResponse({ ok: false, error: 'DEFAULTS_KV is not configured' }, { status: 503 });
  }
  if (!(await isAdminRequest(request, env))) {
    return jsonResponse({ ok: false, error: 'admin auth required' }, { status: 401 });
  }

  const text = await request.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    return jsonResponse({ ok: false, error: 'invalid route project json' }, { status: 400 });
  }

  const validationError = validateRouteProjectPayload(payload);
  if (validationError) {
    return jsonResponse({ ok: false, error: validationError }, { status: 400 });
  }

  await env.DEFAULTS_KV.put(DEFAULT_ROUTE_PROJECT_KEY, JSON.stringify(payload));
  return jsonResponse({ ok: true, updatedAt: Date.now() });
}

async function handleDeleteDefaultProject(request, env) {
  if (!env.DEFAULTS_KV) {
    return jsonResponse({ ok: false, error: 'DEFAULTS_KV is not configured' }, { status: 503 });
  }
  if (!(await isAdminRequest(request, env))) {
    return jsonResponse({ ok: false, error: 'admin auth required' }, { status: 401 });
  }

  await env.DEFAULTS_KV.delete(DEFAULT_ROUTE_PROJECT_KEY);
  return jsonResponse({ ok: true });
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/api/login') {
    return handleSiteLogin(request, env);
  }
  if (url.pathname === '/api/logout') {
    return handleSiteLogout(request);
  }
  if (request.method === 'GET' && url.pathname === '/api/weather') {
    return handleWeather(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/api/default-route-project') {
    return handleGetDefaultProject(env);
  }
  if (request.method === 'POST' && url.pathname === '/api/admin/login') {
    return handleAdminLogin(request, env);
  }
  if (request.method === 'PUT' && url.pathname === '/api/admin/default-route-project') {
    return handlePutDefaultProject(request, env);
  }
  if (request.method === 'DELETE' && url.pathname === '/api/admin/default-route-project') {
    return handleDeleteDefaultProject(request, env);
  }

  return jsonResponse({ ok: false, error: 'not found' }, { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isSiteAuthApi = url.pathname === '/api/login' || url.pathname === '/api/logout';
    const isAdminApi = url.pathname === '/api/admin/login' || url.pathname.startsWith('/api/admin/');

    if (env.APP_PASSWORD && !isSiteAuthApi && !isAdminApi && !(await isSiteRequest(request, env))) {
      if (url.pathname.startsWith('/api/')) {
        return jsonResponse({ ok: false, error: 'site auth required' }, { status: 401 });
      }
      if (request.method === 'GET') {
        return loginPage();
      }
      return new Response('Unauthorized', { status: 401 });
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }

    const response = await env.ASSETS.fetch(request);

    if (response.status !== 404) {
      return response;
    }

    const accept = request.headers.get('accept') ?? '';
    if (request.method === 'GET' && accept.includes('text/html')) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
    }

    return response;
  },
};
