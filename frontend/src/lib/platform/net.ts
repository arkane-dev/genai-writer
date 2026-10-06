// fetch() that works the same in the desktop app and the browser.
//
// Inside Wails, http(s) requests to other origins go through Go (see fetch.go). Go makes
// the real request, so there is no CORS, cookies and auth headers work, and the response
// body streams back chunk by chunk as Wails events. The result is a normal Response,
// so callers (including the OpenAI SDK) can't tell the difference.
// Everything else (data:, blob:, same-origin assets, the browser build) uses window.fetch.
import { FetchStart, FetchCancel } from '$lib/wailsjs/go/main/App';
import { EventsOn } from '$lib/wailsjs/runtime/runtime';
import { inWails } from './env';

let seq = 0;

function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
	const s = atob(b64);
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}

const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

function goesThroughGo(url: URL): boolean {
	return inWails && (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== location.origin;
}

export async function netFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const href = input instanceof Request ? input.url : String(input);
	const url = new URL(href, location.href);
	if (!goesThroughGo(url)) return fetch(input, init);

	const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
	const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
	if (signal?.aborted) throw abortError();

	// A plain Headers object keeps headers a Request would drop, such as Cookie.
	const headers = new Headers(input instanceof Request ? input.headers : undefined);
	new Headers(init?.headers).forEach((v, k) => headers.set(k, v));

	let body = '';
	const rawBody = init?.body ?? (input instanceof Request && input.body ? await input.clone().arrayBuffer() : null);
	if (rawBody != null) {
		// Let the platform encode the body and pick its content type (FormData boundaries, etc.).
		const probe = new Request('http://local.invalid/', { method: 'POST', body: rawBody as BodyInit });
		if (!headers.has('content-type') && probe.headers.get('content-type')) headers.set('content-type', probe.headers.get('content-type')!);
		body = toBase64(new Uint8Array(await probe.arrayBuffer()));
	}
	const headerMap: Record<string, string> = {};
	headers.forEach((v, k) => (headerMap[k] = v));

	const id = `f${Date.now().toString(36)}${(seq++).toString(36)}`;
	let finished = false;
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const offs: (() => void)[] = [];
	const cleanup = () => {
		finished = true;
		offs.forEach((off) => off());
		signal?.removeEventListener('abort', onAbort);
	};
	const fail = (err: unknown) => {
		if (finished) return;
		cleanup();
		controller.error(err);
	};
	function onAbort() {
		FetchCancel(id);
		fail(abortError());
	}

	const stream = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
		},
		cancel() {
			FetchCancel(id);
			cleanup();
		}
	});

	// Listen before starting: Go may send chunks before FetchStart returns.
	offs.push(EventsOn(`fetch:${id}`, (b64: string) => !finished && controller.enqueue(fromBase64(b64))));
	offs.push(
		EventsOn(`fetch:${id}:end`, (err: string) => {
			if (err) return fail(new TypeError(err));
			if (finished) return;
			cleanup();
			controller.close();
		})
	);
	signal?.addEventListener('abort', onAbort);

	let head;
	try {
		head = await FetchStart({ id, method, url: url.href, headers: headerMap, body } as Parameters<typeof FetchStart>[0]);
	} catch (err) {
		cleanup();
		if (signal?.aborted) throw abortError();
		throw new TypeError(`Failed to fetch ${url.href}: ${err}`);
	}

	const noBody = [101, 204, 205, 304].includes(head.status) || method === 'HEAD';
	return new Response(noBody ? null : stream, {
		status: head.status,
		statusText: head.statusText,
		headers: head.headers
	});
}
