package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
)

func main() {
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	// Proxy API to backend
	target, err := url.Parse("http://localhost:8080")
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

	log.Println("listening on http://localhost:5173 (proxying /api -> :8080)")
	log.Fatal(http.ListenAndServe(":5173", nil))
}
