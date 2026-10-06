package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"sync"
)

// Library is the on-disk home of every folder, document, snapshot and snippet.
// Plain JSON files, so the library can be backed up, synced or put in git:
//
//	<root>/library.json                          folders, documents, ID counters
//	<root>/snippets.json                         saved snippets
//	<root>/documents/<docID>/history.json        snapshot index, oldest first
//	<root>/documents/<docID>/snapshots/<id>.json one snapshot each
//	<root>/images/<sha256>.<ext>                 images, shared by every snapshot
//
// The latest snapshot of a document is its current state.
// Images inside snapshot trees are stored once in images/ and referenced by hash,
// so hundreds of snapshots of an illustrated document don't copy the pictures each time.

type Folder struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	ParentID  *int   `json:"parentId"`
	CreatedAt int64  `json:"createdAt"`
}

type Document struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	FolderID  *int   `json:"folderId"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type Snapshot struct {
	ID         int    `json:"id"`
	DocumentID int    `json:"documentId"`
	Timestamp  int64  `json:"timestamp"`
	Message    string `json:"message"`
	Tree       string `json:"tree"` // JSON-serialised tree, owned by the frontend
}

type Snippet struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Tree        string `json:"tree"` // one JSON-serialised node
	CreatedAt   int64  `json:"createdAt"`
}

type snapshotMeta struct {
	ID        int    `json:"id"`
	Timestamp int64  `json:"timestamp"`
	Message   string `json:"message"`
}

type libraryFile struct {
	NextFolder   int        `json:"nextFolder"`
	NextDocument int        `json:"nextDocument"`
	NextSnapshot int        `json:"nextSnapshot"`
	NextSnippet  int        `json:"nextSnippet"`
	Folders      []Folder   `json:"folders"`
	Documents    []Document `json:"documents"`
}

type Store struct {
	mu   sync.Mutex
	root string
}

func NewStore(root string) *Store { return &Store{root: root} }

// defaultLibraryRoot is ~/Documents/GenAI Writer, or $GENAI_WRITER_LIBRARY if set.
func defaultLibraryRoot(app string) string {
	if dir := os.Getenv("GENAI_WRITER_LIBRARY"); dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".", app)
	}
	return filepath.Join(home, "Documents", "GenAI Writer")
}

func (s *Store) Root() string { return s.root }

// ── file helpers ────────────────────────────────────────────────────────────

func (s *Store) path(parts ...string) string {
	return filepath.Join(append([]string{s.root}, parts...)...)
}

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil // missing file = empty value
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

// writeJSON writes atomically (temp file + rename) so a crash never leaves half a file.
func writeJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *Store) loadLib() (libraryFile, error) {
	lib := libraryFile{NextFolder: 1, NextDocument: 1, NextSnapshot: 1, NextSnippet: 1}
	if err := readJSON(s.path("library.json"), &lib); err != nil {
		return lib, fmt.Errorf("read library: %w", err)
	}
	return lib, nil
}

func (s *Store) saveLib(lib libraryFile) error { return writeJSON(s.path("library.json"), lib) }

func (s *Store) docDir(docID int) string { return s.path("documents", strconv.Itoa(docID)) }

func (s *Store) loadHistory(docID int) ([]snapshotMeta, error) {
	var h []snapshotMeta
	err := readJSON(filepath.Join(s.docDir(docID), "history.json"), &h)
	return h, err
}

// ── images: data URLs out of trees and back ─────────────────────────────────

var (
	dataURLRe  = regexp.MustCompile(`data:image/(png|jpe?g|gif|webp|svg\+xml);base64,([A-Za-z0-9+/]+=*)`)
	imageRefRe = regexp.MustCompile(`genai-image:([0-9a-f]{64})\.(png|jpeg|gif|webp|svg)`)
)

var extToMime = map[string]string{"png": "png", "jpeg": "jpeg", "gif": "gif", "webp": "webp", "svg": "svg+xml"}

// externaliseImages writes each embedded image to images/ and swaps it for a short reference.
func (s *Store) externaliseImages(tree string) (string, error) {
	var werr error
	out := dataURLRe.ReplaceAllStringFunc(tree, func(m string) string {
		sub := dataURLRe.FindStringSubmatch(m)
		raw, err := base64.StdEncoding.DecodeString(sub[2])
		if err != nil {
			return m // leave anything odd untouched
		}
		ext := sub[1]
		switch ext {
		case "svg+xml":
			ext = "svg"
		case "jpg":
			ext = "jpeg"
		}
		sum := sha256.Sum256(raw)
		name := hex.EncodeToString(sum[:]) + "." + ext
		p := s.path("images", name)
		if _, err := os.Stat(p); errors.Is(err, fs.ErrNotExist) {
			if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
				werr = err
				return m
			}
			if err := os.WriteFile(p, raw, 0o644); err != nil {
				werr = err
				return m
			}
		}
		return "genai-image:" + name
	})
	return out, werr
}

// internaliseImages turns image references back into data URLs for the frontend.
func (s *Store) internaliseImages(tree string) string {
	return imageRefRe.ReplaceAllStringFunc(tree, func(m string) string {
		sub := imageRefRe.FindStringSubmatch(m)
		raw, err := os.ReadFile(s.path("images", sub[1]+"."+sub[2]))
		if err != nil {
			return m // missing image: keep the reference so nothing is silently lost
		}
		return "data:image/" + extToMime[sub[2]] + ";base64," + base64.StdEncoding.EncodeToString(raw)
	})
}

// ── folders ─────────────────────────────────────────────────────────────────

func (s *Store) ListFolders() ([]Folder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	out := append([]Folder{}, lib.Folders...)
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, err
}

func (s *Store) AddFolder(f Folder) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	if err != nil {
		return 0, err
	}
	f.ID = lib.NextFolder
	lib.NextFolder++
	lib.Folders = append(lib.Folders, f)
	return f.ID, s.saveLib(lib)
}

func (s *Store) RenameFolder(id int, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	if err != nil {
		return err
	}
	for i := range lib.Folders {
		if lib.Folders[i].ID == id {
			lib.Folders[i].Name = name
		}
	}
	return s.saveLib(lib)
}

// DeleteFolder removes the folder and moves its documents to the top level.
func (s *Store) DeleteFolder(id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	if err != nil {
		return err
	}
	kept := lib.Folders[:0]
	for _, f := range lib.Folders {
		if f.ID != id {
			kept = append(kept, f)
		}
	}
	lib.Folders = kept
	for i := range lib.Documents {
		if d := lib.Documents[i].FolderID; d != nil && *d == id {
			lib.Documents[i].FolderID = nil
		}
	}
	return s.saveLib(lib)
}

// ── documents ───────────────────────────────────────────────────────────────

// ListDocuments returns every document, most recently updated first.
func (s *Store) ListDocuments() ([]Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	out := append([]Document{}, lib.Documents...)
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, err
}

// GetDocument returns nil (null in JS) when the document doesn't exist.
func (s *Store) GetDocument(id int) (*Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	for _, d := range lib.Documents {
		if d.ID == id {
			return &d, err
		}
	}
	return nil, err
}

func (s *Store) AddDocument(d Document) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	if err != nil {
		return 0, err
	}
	d.ID = lib.NextDocument
	lib.NextDocument++
	lib.Documents = append(lib.Documents, d)
	return d.ID, s.saveLib(lib)
}

// DocumentPatch carries the fields to change. Nil fields are left alone.
// MoveFolder is needed because a nil FolderID means "top level", not "unchanged".
type DocumentPatch struct {
	Title      *string `json:"title"`
	FolderID   *int    `json:"folderId"`
	MoveFolder bool    `json:"moveFolder"`
	UpdatedAt  *int64  `json:"updatedAt"`
}

func (s *Store) UpdateDocument(id int, p DocumentPatch) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	if err != nil {
		return err
	}
	for i := range lib.Documents {
		d := &lib.Documents[i]
		if d.ID != id {
			continue
		}
		if p.Title != nil {
			d.Title = *p.Title
		}
		if p.MoveFolder {
			d.FolderID = p.FolderID
		}
		if p.UpdatedAt != nil {
			d.UpdatedAt = *p.UpdatedAt
		}
	}
	return s.saveLib(lib)
}

// DeleteDocument removes the document and all of its history. Images stay: other
// documents may share them.
func (s *Store) DeleteDocument(id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	if err != nil {
		return err
	}
	kept := lib.Documents[:0]
	for _, d := range lib.Documents {
		if d.ID != id {
			kept = append(kept, d)
		}
	}
	lib.Documents = kept
	if err := s.saveLib(lib); err != nil {
		return err
	}
	return os.RemoveAll(s.docDir(id))
}

// ── snapshots ───────────────────────────────────────────────────────────────

func (s *Store) AddSnapshot(sn Snapshot) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	if err != nil {
		return 0, err
	}
	tree, err := s.externaliseImages(sn.Tree)
	if err != nil {
		return 0, fmt.Errorf("save images: %w", err)
	}
	sn.ID = lib.NextSnapshot
	sn.Tree = tree
	lib.NextSnapshot++
	if err := writeJSON(filepath.Join(s.docDir(sn.DocumentID), "snapshots", strconv.Itoa(sn.ID)+".json"), sn); err != nil {
		return 0, err
	}
	h, err := s.loadHistory(sn.DocumentID)
	if err != nil {
		return 0, err
	}
	h = append(h, snapshotMeta{ID: sn.ID, Timestamp: sn.Timestamp, Message: sn.Message})
	if err := writeJSON(filepath.Join(s.docDir(sn.DocumentID), "history.json"), h); err != nil {
		return 0, err
	}
	return sn.ID, s.saveLib(lib)
}

func (s *Store) readSnapshot(docID, id int) (*Snapshot, error) {
	var sn *Snapshot
	err := readJSON(filepath.Join(s.docDir(docID), "snapshots", strconv.Itoa(id)+".json"), &sn)
	if sn != nil {
		sn.Tree = s.internaliseImages(sn.Tree)
	}
	return sn, err
}

// GetSnapshot returns nil (null in JS) when the snapshot doesn't exist.
func (s *Store) GetSnapshot(docID, id int) (*Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readSnapshot(docID, id)
}

// ListSnapshots returns a document's snapshots with their trees, oldest first.
func (s *Store) ListSnapshots(docID int) ([]Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	h, err := s.loadHistory(docID)
	if err != nil {
		return nil, err
	}
	out := make([]Snapshot, 0, len(h))
	for _, m := range h {
		sn, err := s.readSnapshot(docID, m.ID)
		if err != nil {
			return nil, err
		}
		if sn != nil {
			out = append(out, *sn)
		}
	}
	return out, nil
}

// ClearSnapshots deletes a document's history. docID 0 clears every document.
func (s *Store) ClearSnapshots(docID int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if docID != 0 {
		return os.RemoveAll(s.docDir(docID))
	}
	return os.RemoveAll(s.path("documents"))
}

// ── snippets ────────────────────────────────────────────────────────────────

func (s *Store) ListSnippets() ([]Snippet, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Snippet
	err := readJSON(s.path("snippets.json"), &out)
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	if out == nil {
		out = []Snippet{}
	}
	return out, err
}

func (s *Store) AddSnippet(sn Snippet) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lib, err := s.loadLib()
	if err != nil {
		return 0, err
	}
	var all []Snippet
	if err := readJSON(s.path("snippets.json"), &all); err != nil {
		return 0, err
	}
	sn.ID = lib.NextSnippet
	lib.NextSnippet++
	all = append(all, sn)
	if err := writeJSON(s.path("snippets.json"), all); err != nil {
		return 0, err
	}
	return sn.ID, s.saveLib(lib)
}

func (s *Store) DeleteSnippet(id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var all []Snippet
	if err := readJSON(s.path("snippets.json"), &all); err != nil {
		return err
	}
	kept := all[:0]
	for _, sn := range all {
		if sn.ID != id {
			kept = append(kept, sn)
		}
	}
	return writeJSON(s.path("snippets.json"), kept)
}
