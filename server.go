package main

import (
    "log"
    "net/http"
    "net/http/httputil"
    "net/url"
    "os"
)

func main() {
    fs := http.FileServer(http.Dir("static"))
    http.Handle("/static/", http.StripPrefix("/static/", fs))

    // On Render, use the INTERNAL backend URL to avoid a public routing loop.
    // Get this from Render Dashboard → backend service → Connect → Internal.
    // Locally, fall back to localhost.
    backendURL := os.Getenv("BACKEND_URL")
    if backendURL == "" {
        backendURL = "http://localhost:8080"
    }
    target, err := url.Parse(backendURL)
    if err != nil {
        log.Fatal(err)
    }
    http.Handle("/api/", httputil.NewSingleHostReverseProxy(target))

    pages := map[string]string{
        "/":                "static/index.html",
        "/login":           "static/login.html",
        "/signup":          "static/signup.html",
        "/verify":          "static/verify.html",
        "/forgot-password": "static/forgot-password.html",
        "/me":              "static/me.html",
        "/product":         "static/product.html",
        "/cart":            "static/cart.html",
        "/checkout":        "static/checkout.html",
        "/orders":          "static/orders.html",
        "/order":           "static/order.html",
        "/account/deleted": "static/account-deleted.html",
    }

    for route, file := range pages {
        r := route
        f := file
        http.HandleFunc(r, func(w http.ResponseWriter, req *http.Request) {
            if req.URL.Path != r {
                http.NotFound(w, req)
                return
            }
            http.ServeFile(w, req, f)
        })
    }

    port := os.Getenv("PORT")
    if port == "" {
        port = "5173"
    }
    log.Printf("listening on :%s (proxying /api -> %s)", port, backendURL)
    log.Fatal(http.ListenAndServe(":"+port, nil))
}
