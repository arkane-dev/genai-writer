package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
)

// KV holds small app state the frontend used to keep in localStorage: the model API
// config (including keys) and the open document. One JSON file in the OS config dir
// (~/.config/<app>/prefs.json on Linux), readable by the user only.
type KV struct {
	mu   sync.Mutex
	path string
}

func NewKV(app string) *KV {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return &KV{path: filepath.Join(dir, app, "prefs.json")}
}

func (k *KV) load() (map[string]string, error) {
	m := map[string]string{}
	b, err := os.ReadFile(k.path)
	if errors.Is(err, fs.ErrNotExist) {
		return m, nil
	}
	if err != nil {
		return m, err
	}
	return m, json.Unmarshal(b, &m)
}

// All returns every key, so the frontend can load once at startup and read synchronously.
func (k *KV) All() (map[string]string, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.load()
}

// Set stores a value. An empty value deletes the key.
func (k *KV) Set(key, value string) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	m, err := k.load()
	if err != nil {
		return err
	}
	if value == "" {
		delete(m, key)
	} else {
		m[key] = value
	}
	if err := os.MkdirAll(filepath.Dir(k.path), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	tmp := k.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, k.path)
}

func (k *KV) Path() string { return k.path }
