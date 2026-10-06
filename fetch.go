package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// The frontend's fetch() runs through here inside Wails. Go makes the real HTTP request,
// so there is no CORS, cookies and auth headers can be set freely, and API calls never
// depend on what the webview allows. Response bodies stream back as events, so
// server-sent events (LLM token streams) arrive as they are produced.
//
// Protocol, per request ID chosen by the frontend:
//   FetchStart(req) returns status + headers once they arrive.
//   Then events "fetch:<id>" carry base64 body chunks, in order.
//   A final "fetch:<id>:end" event carries "" on success, or an error message.
//   FetchCancel(id) aborts the request at any point.

type FetchRequest struct {
	ID      string            `json:"id"`
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"` // base64, empty for no body
}

type FetchHead struct {
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
}

type fetcher struct {
	client *http.Client
	mu     sync.Mutex
	cancel map[string]context.CancelFunc
	// emit sends an event to the frontend. Swapped out in tests.
	emit func(name string, data ...interface{})
}

func newFetcher() *fetcher {
	return &fetcher{
		// No overall timeout: LLM streams can run for minutes. Dial and header waits are bounded.
		client: &http.Client{Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			ResponseHeaderTimeout: 5 * time.Minute,
			IdleConnTimeout:       90 * time.Second,
		}},
		cancel: map[string]context.CancelFunc{},
	}
}

func (f *fetcher) start(req FetchRequest) (FetchHead, error) {
	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return FetchHead{}, fmt.Errorf("fetch: only http and https URLs are allowed, got %q", req.URL)
	}
	var body io.Reader
	if req.Body != "" {
		b, err := base64.StdEncoding.DecodeString(req.Body)
		if err != nil {
			return FetchHead{}, fmt.Errorf("fetch: bad body encoding: %w", err)
		}
		body = bytes.NewReader(b)
	}
	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	ctx, cancel := context.WithCancel(context.Background())
	f.mu.Lock()
	f.cancel[req.ID] = cancel
	f.mu.Unlock()

	hr, err := http.NewRequestWithContext(ctx, method, req.URL, body)
	if err != nil {
		f.done(req.ID)
		return FetchHead{}, err
	}
	for k, v := range req.Headers {
		hr.Header.Set(k, v)
	}
	res, err := f.client.Do(hr)
	if err != nil {
		f.done(req.ID)
		return FetchHead{}, err
	}

	head := FetchHead{Status: res.StatusCode, StatusText: strings.TrimSpace(strings.TrimPrefix(res.Status, fmt.Sprint(res.StatusCode))), Headers: map[string]string{}}
	for k, v := range res.Header {
		head.Headers[strings.ToLower(k)] = strings.Join(v, ", ")
	}

	go f.pump(req.ID, res.Body)
	return head, nil
}

// pump streams the body to the frontend in chunks. Small reads keep token streams live.
func (f *fetcher) pump(id string, body io.ReadCloser) {
	defer body.Close()
	defer f.done(id)
	buf := make([]byte, 32*1024)
	for {
		n, err := body.Read(buf)
		if n > 0 {
			f.emit("fetch:"+id, base64.StdEncoding.EncodeToString(buf[:n]))
		}
		if errors.Is(err, io.EOF) {
			f.emit("fetch:"+id+":end", "")
			return
		}
		if err != nil {
			f.emit("fetch:"+id+":end", err.Error())
			return
		}
	}
}

func (f *fetcher) stop(id string) {
	f.mu.Lock()
	c := f.cancel[id]
	f.mu.Unlock()
	if c != nil {
		c()
	}
}

func (f *fetcher) done(id string) {
	f.mu.Lock()
	if c := f.cancel[id]; c != nil {
		c()
		delete(f.cancel, id)
	}
	f.mu.Unlock()
}

// Bound methods.

func (a *App) FetchStart(req FetchRequest) (FetchHead, error) { return a.fetch.start(req) }
func (a *App) FetchCancel(id string)                          { a.fetch.stop(id) }

func (a *App) bindFetchEvents() {
	a.fetch.emit = func(name string, data ...interface{}) { runtime.EventsEmit(a.ctx, name, data...) }
}
