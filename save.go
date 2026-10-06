package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SaveFile asks where to save an export, then writes it. WebKitGTK in Wails can't do
// browser downloads, so exports come here instead of an <a download> link.
// Returns the chosen path, or "" if the user cancelled.
func (a *App) SaveFile(name, dataB64 string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return "", fmt.Errorf("save: bad data: %w", err)
	}
	home, _ := os.UserHomeDir()
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            "Export document",
		DefaultFilename:  name,
		DefaultDirectory: filepath.Join(home, "Documents"),
	})
	if err != nil || path == "" {
		return "", err
	}
	return path, writeFile(path, data)
}

func writeFile(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
