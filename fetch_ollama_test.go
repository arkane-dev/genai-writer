package main

import (
	"encoding/base64"
	"os"
	"strings"
	"testing"
	"time"
)

// Opt-in: OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL=<model> go test -run Ollama
// Streams a real chat completion through the proxy, the way the OpenAI SDK does.
func TestOllamaStreamingChat(t *testing.T) {
	base, model := os.Getenv("OLLAMA_URL"), os.Getenv("OLLAMA_MODEL")
	if base == "" || model == "" {
		t.Skip("set OLLAMA_URL and OLLAMA_MODEL to run")
	}
	f := newFetcher()
	var chunks int
	rec := newRecorder(f, "o1")
	inner := f.emit
	f.emit = func(name string, data ...interface{}) {
		if name == "fetch:o1" {
			chunks++
		}
		inner(name, data...)
	}
	body := `{"model":"` + model + `","stream":true,"messages":[{"role":"user","content":"Reply with the single word: ready"}]}`
	head, err := f.start(FetchRequest{ID: "o1", Method: "POST", URL: base + "/v1/chat/completions",
		Headers: map[string]string{"Content-Type": "application/json", "Authorization": "Bearer ollama"},
		Body:    base64.StdEncoding.EncodeToString([]byte(body))})
	if err != nil {
		t.Fatal(err)
	}
	if head.Status != 200 {
		t.Fatalf("status %d", head.Status)
	}
	select {
	case e := <-rec.end:
		if e != "" {
			t.Fatalf("stream error: %s", e)
		}
	case <-time.After(3 * time.Minute):
		t.Fatal("timed out")
	}
	got := rec.body.String()
	if !strings.Contains(got, "data: ") || !strings.Contains(got, "[DONE]") {
		t.Fatalf("not an SSE stream:\n%s", got)
	}
	t.Logf("%d chunks, content-type %s", chunks, head.Headers["content-type"])
}
