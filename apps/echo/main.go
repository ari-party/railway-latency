package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ok := []byte("OK")
	http.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		w.Write(ok)
	})

	addr := "0.0.0.0:" + port
	log.Printf("Server listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
