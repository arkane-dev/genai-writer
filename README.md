# genai-writer

GenAI Writer as a desktop app. A document editor that puts what you say ahead of how it looks.
You build a content tree of sections, text, images, code, equations and tables, and describe
each part in plain words. The AI writes the prose.

Wails v2 (Go) + SvelteKit (Svelte 5) + NEONDECK. Started as a browser app, then ported to Wails.

## Status

- **Phase 1 (done):** runs in Wails with a Go backend.
- **Phase 2 (done):** NEONDECK look, frameless window with the AppShell title bar. The document preview is on paper (editorial mode).
  axe: 0 violations on every screen and dialog (WCAG 2.2 AA).

## Download
Linux, Windows and macOS builds are on the [Releases](https://github.com/arkane-dev/genai-writer/releases) page.
Linux needs GTK 3 and WebKitGTK 4.1 (`webkit2gtk-4.1` on Arch/Manjaro, `libwebkit2gtk-4.1-0` on Debian/Ubuntu).
The Windows build needs Windows 10 or 11. It isn't code-signed yet, so SmartScreen may warn the first time.
The macOS build is one app for Intel and Apple Silicon and needs macOS 12 or later. It isn't signed with
an Apple Developer ID, so macOS blocks the first launch: use *System Settings → Privacy & Security → Open Anyway*.

## Build from source
NEONDECK, the design system, lives in its own repo and installs from a folder beside this one:
```bash
mkdir cyberpunk_apps && cd cyberpunk_apps
git clone https://github.com/arkane-dev/genai-writer
git clone https://github.com/arkane-dev/neondeck sharable_assets
(cd sharable_assets/neondeck && npm install && npm run build)
```
Needs Go ≥ 1.25, Node 22+, and the Wails CLI v2.14 (`go install github.com/wailsapp/wails/v2/cmd/wails@v2.14.0`).

## Setup
```bash
source .venv/bin/activate          # node/npm live in the venv (uv + nodeenv)
make dev                           # live reload; also serves the app at http://localhost:34115
make build                         # binary in build/bin/
make test                          # go vet + go test
make bindings                      # after adding/changing exported Go methods
make dist VERSION=0.1.2            # release archives + SHA256SUMS in build/dist/
```
`cd frontend && npm run dev` runs the UI in a plain browser. It then uses IndexedDB and browser
fetch instead of Go, the same code path a hosted web build would use.

## Where things live

| What | Desktop | Browser |
|---|---|---|
| Documents, history, snippets | `~/Documents/GenAI Writer/` (override: `GENAI_WRITER_LIBRARY`) | IndexedDB |
| API config and keys, open document | `~/.config/genai-writer/prefs.json`, mode 0600 | localStorage |

The library is plain JSON. `library.json` lists folders and documents. Each document has a
`documents/<id>/` folder with `history.json` and one file per snapshot. Images are stored once
in `images/` by content hash, and snapshots refer to them.

## How the backend works

| Path | What |
|---|---|
| `fetch.go` | streaming HTTP proxy. Every outbound request (models, SwarmUI, reference URLs) goes through Go: no CORS, cookies work, bodies stream back as events |
| `store.go` | the document library on disk |
| `kv.go` | small key-value state, the desktop replacement for localStorage |
| `save.go` | native Save dialog for exports (the webview can't do browser downloads) |
| `frontend/src/lib/platform/` | `net.ts` (fetch through Go), `store.svelte.ts` (Go or Dexie), `kv.ts`, `save.ts` (exports), `window.ts`. App code calls these, never Go or Dexie directly |
| `frontend/src/lib/wailsjs/` | generated bindings (`make bindings`), committed |

Routes use the hash router (`#/documents`), so every page lives in one `index.html`.

## Release
1. `make dist VERSION=x.y.z` sets the version, builds Linux and Windows, and writes the archives and `SHA256SUMS` to `build/dist/`.
2. Commit, tag `vx.y.z` and push. Then `gh release create vx.y.z -F notes.md build/dist/*`.
3. Publishing starts `.github/workflows/macos.yml`, which builds the macOS app and attaches it to the release.
4. Update the download links in the site's `src/lib/content/projects.ts`.

## Tests
- `make test` runs the Go tests: store round trips, shared images, KV file mode, the fetch proxy.
- `OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL=<model> go test -tags webkit2_41 -run Ollama .`
  streams a real chat completion through the proxy. Off by default.

## Notes
- The top bar is the title bar (`--wails-draggable: drag`). Buttons and links inside opt out.
- PDF export prints from a hidden frame on desktop. The print dialog's "Print to File" makes the PDF.
- NEONDECK is copied in (`install-links=true`). After changing it in `sharable_assets`, rebuild it there, then `npm run update:neondeck` in `frontend/`.
- WebKitGTK 4.1 needs `-tags webkit2_41`. The Makefile adds it.
- `env_linux.go` turns off WebKit's DMA-BUF renderer (blank window on NVIDIA).
- Windows: `make windows` cross-compiles from Linux. macOS needs a Mac or CI.

## License

[MIT](LICENSE) © 2026 Andrew R. Kane
