// Command photon-engine é o motor auxiliar do Photon (otimização de imagens,
// compressão de assets e cache endereçado por conteúdo).
//
// Fase 0: stub que responde a `info` e `version`. O daemon JSON-RPC (stdio) e o
// modo batch estão especificados em docs/ENGINE.md e serão implementados na Fase 5.
package main

import (
	"encoding/json"
	"fmt"
	"os"
)

const version = "0.0.0"

type engineInfo struct {
	Version      string   `json:"version"`
	ImageBackend string   `json:"imageBackend"`
	Formats      []string `json:"formats"`
	Hash         string   `json:"hash"`
}

func main() {
	cmd := "help"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	switch cmd {
	case "info":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(engineInfo{
			Version:      version,
			ImageBackend: "none (stub)",
			Formats:      []string{"avif", "webp", "jpeg", "png"},
			Hash:         "blake3",
		})
	case "version":
		fmt.Println(version)
	default:
		fmt.Fprintln(os.Stderr, "photon-engine — uso: photon-engine [info|version]")
		fmt.Fprintln(os.Stderr, "daemon JSON-RPC e batch: a implementar (ver docs/ENGINE.md)")
		os.Exit(2)
	}
}
