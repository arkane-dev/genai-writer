package main

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// recorder collects emitted events like the frontend would.
type recorder struct {
	mu   sync.Mutex
	body strings.Builder
	end  chan string
}

func newRecorder(f *fetcher, id string) *recorder {
	r := &recorder{end: make(chan string, 1)}
	f.emit = func(name string, data ...interface{}) {
		switch name {
		case "fetch:" + id:
			b, _ := base64.StdEncoding.DecodeString(data[0].(string))
			r.mu.Lock()
			r.body.Write(b)
			r.mu.Unlock()
		case "fetch:" + id + ":end":
			r.end <- data[0].(string)
		}
	}
	return r
}

func TestFetchStreamsBodyAndHeaders(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer k" || r.Method != "POST" {
			http.Error(w, "bad request", 400)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		for _, tok := range []string{"data: one\n\n", "data: two\n\n"} {
			w.Write([]byte(tok))
			w.(http.Flusher).Flush()
		}
	}))
	defer srv.Close()

	f := newFetcher()
	rec := newRecorder(f, "r1")
	head, err := f.start(FetchRequest{ID: "r1", Method: "POST", URL: srv.URL,
		Headers: map[string]string{"Authorization": "Bearer k"},
		Body:    base64.StdEncoding.EncodeToString([]byte(`{}`))})
	if err != nil {
		t.Fatal(err)
	}
	if head.Status != 200 || head.Headers["content-type"] != "text/event-stream" {
		t.Fatalf("head = %+v", head)
	}
	if e := <-rec.end; e != "" {
		t.Fatalf("stream ended with error %q", e)
	}
	if got := rec.body.String(); got != "data: one\n\ndata: two\n\n" {
		t.Fatalf("body = %q", got)
	}
}

func TestFetchCancelStopsStream(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("partial"))
		w.(http.Flusher).Flush()
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}))
	defer srv.Close()
	defer close(release)

	f := newFetcher()
	rec := newRecorder(f, "r2")
	if _, err := f.start(FetchRequest{ID: "r2", URL: srv.URL}); err != nil {
		t.Fatal(err)
	}
	f.stop("r2")
	select {
	case e := <-rec.end:
		if e == "" {
			t.Fatal("cancelled stream reported success")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancel did not end the stream")
	}
}

func TestFetchRejectsNonHTTP(t *testing.T) {
	f := newFetcher()
	for _, u := range []string{"file:///etc/passwd", "data:text/plain,hi", "not a url"} {
		if _, err := f.start(FetchRequest{ID: "x", URL: u}); err == nil {
			t.Errorf("%s: want error", u)
		}
	}
}
