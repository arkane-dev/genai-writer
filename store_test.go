package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreDocumentsAndFolders(t *testing.T) {
	s := NewStore(t.TempDir())
	fid, err := s.AddFolder(Folder{Name: "Drafts"})
	if err != nil || fid != 1 {
		t.Fatalf("AddFolder = %d, %v", fid, err)
	}
	did, _ := s.AddDocument(Document{Title: "One", FolderID: &fid, UpdatedAt: 1})
	s.AddDocument(Document{Title: "Two", UpdatedAt: 2})

	docs, _ := s.ListDocuments()
	if len(docs) != 2 || docs[0].Title != "Two" {
		t.Fatalf("ListDocuments not newest first: %+v", docs)
	}

	title, at := "Renamed", int64(9)
	if err := s.UpdateDocument(did, DocumentPatch{Title: &title, UpdatedAt: &at}); err != nil {
		t.Fatal(err)
	}
	d, _ := s.GetDocument(did)
	if d.Title != "Renamed" || d.UpdatedAt != 9 || d.FolderID == nil {
		t.Fatalf("UpdateDocument changed the wrong fields: %+v", d)
	}

	// Deleting a folder moves its documents to the top level.
	if err := s.DeleteFolder(fid); err != nil {
		t.Fatal(err)
	}
	d, _ = s.GetDocument(did)
	if d.FolderID != nil {
		t.Fatalf("document still in deleted folder: %+v", d)
	}
	if missing, _ := s.GetDocument(99); missing != nil {
		t.Fatal("GetDocument(99) should be nil")
	}
}

func TestSnapshotsShareImages(t *testing.T) {
	root := t.TempDir()
	s := NewStore(root)
	did, _ := s.AddDocument(Document{Title: "Pics"})
	img := "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("not really a png"))
	tree := `[{"id":"n100","imageUrl":"` + img + `"}]`

	id1, err := s.AddSnapshot(Snapshot{DocumentID: did, Timestamp: 1, Message: "a", Tree: tree})
	if err != nil {
		t.Fatal(err)
	}
	id2, _ := s.AddSnapshot(Snapshot{DocumentID: did, Timestamp: 2, Message: "b", Tree: tree})

	// On disk: one image file, and no base64 inside the snapshot.
	imgs, _ := os.ReadDir(filepath.Join(root, "images"))
	if len(imgs) != 1 {
		t.Fatalf("want 1 shared image, got %d", len(imgs))
	}
	raw, _ := os.ReadFile(filepath.Join(root, "documents", "1", "snapshots", "1.json"))
	if strings.Contains(string(raw), "base64") {
		t.Fatal("snapshot file still embeds the image")
	}

	// Back out: the frontend gets the original data URL.
	got, _ := s.GetSnapshot(did, id2)
	if got.Tree != tree {
		t.Fatalf("round trip changed the tree:\n%s", got.Tree)
	}
	all, _ := s.ListSnapshots(did)
	if len(all) != 2 || all[0].ID != id1 || all[1].Tree != tree {
		t.Fatalf("ListSnapshots = %+v", all)
	}

	// Deleting the document removes its history but keeps shared images.
	s.DeleteDocument(did)
	if left, _ := s.ListSnapshots(did); len(left) != 0 {
		t.Fatal("history survived document delete")
	}
	if imgs, _ := os.ReadDir(filepath.Join(root, "images")); len(imgs) != 1 {
		t.Fatal("shared image was deleted")
	}
}

func TestSnippets(t *testing.T) {
	s := NewStore(t.TempDir())
	if list, _ := s.ListSnippets(); list == nil || len(list) != 0 {
		t.Fatalf("empty ListSnippets should be [], got %#v", list)
	}
	a, _ := s.AddSnippet(Snippet{Name: "old", CreatedAt: 1})
	s.AddSnippet(Snippet{Name: "new", CreatedAt: 2})
	list, _ := s.ListSnippets()
	if len(list) != 2 || list[0].Name != "new" {
		t.Fatalf("ListSnippets not newest first: %+v", list)
	}
	s.DeleteSnippet(a)
	if list, _ := s.ListSnippets(); len(list) != 1 || list[0].Name != "new" {
		t.Fatalf("DeleteSnippet: %+v", list)
	}
}

func TestKVIsPrivate(t *testing.T) {
	k := &KV{path: filepath.Join(t.TempDir(), "app", "prefs.json")}
	if err := k.Set("ai_writer_config", `{"apiKey":"sk-test"}`); err != nil {
		t.Fatal(err)
	}
	fi, _ := os.Stat(k.path)
	if fi.Mode().Perm() != 0o600 {
		t.Fatalf("prefs.json mode = %v, want 0600 (it holds API keys)", fi.Mode().Perm())
	}
	k.Set("ai_writer_config", "")
	if m, _ := k.All(); len(m) != 0 {
		t.Fatalf("empty value should delete the key: %v", m)
	}
}
