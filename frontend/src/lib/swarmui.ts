import { netFetch } from '$lib/platform/net';
/**
 * SwarmUI API client.
 *
 * Flow:
 *  1. POST /API/GetNewSession        → session_id (cached per base URL)
 *  2. POST {endpoint}                → { images: ["View/local/raw/…"] }
 *  3. GET  {baseURL}/{imagePath}     → binary → data URL
 *
 * Sessions are cached in memory. If the server returns error_id
 * "invalid_session_id" the session is evicted and the request retried once.
 */

export interface SwarmUIImageConfig {
	baseURL: string;            // e.g. http://localhost:7801
	swarmToken?: string;        // optional auth token (sent as Cookie if set)
	model?: string;             // leave blank to use SwarmUI default
	endpoint?: string;          // default /API/GenerateText2Image
	width?: number;             // default 1024
	height?: number;            // default 1024
	steps?: number;             // default 20
	cfgScale?: number;          // default 7
}

// ── Session cache ──────────────────────────────────────────────────────────

const sessionCache = new Map<string, string>();

// The desktop app sends requests through Go, so the swarm_token cookie can be set directly.
// Browsers forbid setting Cookie from script and drop it silently, so there the browser's
// own SwarmUI login cookie is used instead.
function swarmHeaders(swarmToken?: string): Record<string, string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (swarmToken) headers['Cookie'] = `swarm_token=${swarmToken}`;
	return headers;
}

async function fetchSession(baseURL: string, swarmToken?: string): Promise<string> {
	if (!baseURL) throw new Error('SwarmUI: no base URL configured');
	const headers = swarmHeaders(swarmToken);

	const res = await netFetch(`${baseURL}/API/GetNewSession`, {
		method: 'POST',
		headers,
		credentials: 'include',
		body: JSON.stringify({}),
	});

	if (!res.ok) {
		throw new Error(`SwarmUI: failed to get session — HTTP ${res.status}`);
	}

	const data: { session_id?: string; error?: string } = await res.json();
	if (data.error) throw new Error(`SwarmUI: ${data.error}`);
	if (!data.session_id) throw new Error('SwarmUI: no session_id in response');

	return data.session_id;
}

async function getSession(baseURL: string, swarmToken?: string): Promise<string> {
	const cached = sessionCache.get(baseURL);
	if (cached) return cached;
	const sessionId = await fetchSession(baseURL, swarmToken);
	sessionCache.set(baseURL, sessionId);
	return sessionId;
}

function evictSession(baseURL: string): void {
	sessionCache.delete(baseURL);
}

// ── Image retrieval ────────────────────────────────────────────────────────

/**
 * Converts a SwarmUI image path (e.g. "View/local/raw/…/file.png") or an
 * already-formed URL to a base64 data URL.
 */
async function pathToDataUrl(baseURL: string, imagePath: string, swarmToken?: string): Promise<string> {
	// Some versions return data: URLs directly
	if (imagePath.startsWith('data:')) return imagePath;

	const url = /^https?:\/\//.test(imagePath)
		? imagePath
		: `${baseURL}/${imagePath.replace(/^\//, '')}`;

	const res = await netFetch(url, { credentials: 'include', headers: swarmHeaders(swarmToken) });
	if (!res.ok) throw new Error(`SwarmUI: failed to retrieve image — HTTP ${res.status}`);

	const contentType = res.headers.get('content-type') ?? 'image/png';
	const arrayBuffer = await res.arrayBuffer();
	const bytes = new Uint8Array(arrayBuffer);

	// Convert binary to base64 in chunks to avoid call-stack overflow on large images
	let binary = '';
	const chunk = 8192;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}

	return `data:${contentType};base64,${btoa(binary)}`;
}

// ── Main generate function ─────────────────────────────────────────────────

export interface SwarmUIResult {
	dataUrl: string;
	prompt: string;
}

/**
 * Generates an image via SwarmUI and returns a data URL.
 * Automatically handles session expiry (one retry).
 */
export async function swarmUIGenerate(
	prompt: string,
	config: SwarmUIImageConfig,
): Promise<SwarmUIResult> {
	const baseURL = config.baseURL.replace(/\/+$/, '');
	const endpoint = (config.endpoint ?? '/API/GenerateText2Image').replace(/^\/?/, '/');

	const buildBody = (sessionId: string) => ({
		session_id: sessionId,
		images: 1,
		prompt,
		...(config.model ? { model: config.model } : {}),
		width: config.width ?? 1024,
		height: config.height ?? 1024,
		steps: config.steps ?? 20,
		cfgscale: config.cfgScale ?? 7,
		seed: -1,
		donotsave: false,
	});

	const doRequest = async (sessionId: string): Promise<Response> =>
		netFetch(`${baseURL}${endpoint}`, {
			method: 'POST',
			headers: swarmHeaders(config.swarmToken),
			credentials: 'include',
			body: JSON.stringify(buildBody(sessionId)),
		});

	// First attempt
	let sessionId = await getSession(baseURL, config.swarmToken);
	let res = await doRequest(sessionId);
	let data: { images?: string[]; error?: string; error_id?: string } = await res.json();

	// Retry once on session expiry
	if (data.error_id === 'invalid_session_id') {
		evictSession(baseURL);
		sessionId = await getSession(baseURL, config.swarmToken);
		res = await doRequest(sessionId);
		data = await res.json();
	}

	if (data.error) throw new Error(`SwarmUI: ${data.error}`);
	if (!data.images?.length) throw new Error('SwarmUI: no images returned');

	const dataUrl = await pathToDataUrl(baseURL, data.images[0], config.swarmToken);
	return { dataUrl, prompt };
}

/**
 * Tests connectivity by getting a session. Returns the session_id on success.
 */
export async function swarmUITestConnection(
	baseURL: string,
	swarmToken?: string,
): Promise<string> {
	evictSession(baseURL.replace(/\/+$/, ''));
	return getSession(baseURL.replace(/\/+$/, ''), swarmToken);
}
