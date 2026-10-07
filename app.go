package main

import (
	"context"
	"os"
	"runtime"
)

// Version is rewritten at release time (or by hand). Shown in the status bar.
const Version = "0.1.1"

// App holds backend state. Every exported method is callable from the frontend
// through the generated bindings in frontend/src/lib/wailsjs/go/main/App.
type App struct {
	ctx      context.Context
	settings *SettingsStore
	fetch    *fetcher
}

func NewApp() *App {
	return &App{settings: NewSettingsStore(appName), fetch: newFetcher()}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.bindFetchEvents()
}

// AppInfo is what the status bar and dashboard show about the running build.
type AppInfo struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	GoVersion string `json:"goVersion"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	Hostname  string `json:"hostname"`
	CPUs      int    `json:"cpus"`
}

func (a *App) AppInfo() AppInfo {
	host, _ := os.Hostname()
	return AppInfo{
		Name:      appName,
		Version:   Version,
		GoVersion: runtime.Version(),
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		Hostname:  host,
		CPUs:      runtime.NumCPU(),
	}
}

// GetSettings / SaveSettings persist user preferences (see settings.go).
func (a *App) GetSettings() Settings         { return a.settings.Load() }
func (a *App) SaveSettings(s Settings) error { return a.settings.Save(s) }
func (a *App) SettingsPath() string          { return a.settings.Path() }
