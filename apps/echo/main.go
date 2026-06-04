package main

import (
	"log"
	"net/http"
	"os"
	"time"

	_ "go.uber.org/automaxprocs"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ok := []byte("OK")
	handler := func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write(ok)
	}

	addr := "0.0.0.0:" + port
	srv := &http.Server{
		Addr:    addr,
		Handler: http.HandlerFunc(handler),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("Server listening on %s", addr)
	log.Fatal(srv.ListenAndServe())
}
