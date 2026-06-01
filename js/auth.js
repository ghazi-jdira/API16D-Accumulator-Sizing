/*
 * Username/password sign-in gate (server-enforced).
 *
 * The login form posts credentials to the backend (POST /api/login). The server
 * verifies them against stored password hashes and returns a short-lived signed
 * token. The browser stores that token and sends it on every API call; the
 * server re-verifies it before running any calculation or returning any data.
 *
 * Passwords are never stored in the browser and the confidential data/formulas
 * never reach an unauthenticated client. Manage users on the backend with
 * manage_users.py.
 */
(function () {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const API = (cfg.apiBase || "").replace(/\/$/, "");
  const TOKEN_KEY = "api16d_token";
  let token = sessionStorage.getItem(TOKEN_KEY) || null;

  // Public surface used by app.js.
  window.Auth = {
    getToken: () => token,
    isAuthed: () => !!token,
    signOut,
    onUnauthorized,
  };

  function show(el, on) { if (el) el.style.display = on ? "" : "none"; }

  function reveal(isAuthed) {
    show(document.getElementById("login"), !isAuthed);
    show(document.getElementById("logoutBtn"), isAuthed);
    document.body.classList.toggle("locked", !isAuthed);
  }

  function signOut() {
    token = null;
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  // Called by app.js when an API request comes back 401 (token expired/invalid).
  function onUnauthorized() {
    token = null;
    sessionStorage.removeItem(TOKEN_KEY);
    reveal(false);
    const err = document.getElementById("loginError");
    if (err) err.textContent = "Your session expired. Please sign in again.";
  }

  async function submitLogin(e) {
    e.preventDefault();
    const userEl = document.getElementById("loginUser");
    const passEl = document.getElementById("loginPass");
    const errEl = document.getElementById("loginError");
    const btn = document.getElementById("loginBtn");
    errEl.textContent = "";
    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = "Signing in…";
    try {
      const res = await fetch(API + "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: userEl.value.trim(), password: passEl.value }),
      });
      if (res.status === 401) { errEl.textContent = "Invalid username or password."; return; }
      if (!res.ok) { errEl.textContent = "Sign-in failed (server error)."; return; }
      const data = await res.json();
      token = data.token;
      sessionStorage.setItem(TOKEN_KEY, token);
      passEl.value = "";
      reveal(true);
      window.dispatchEvent(new Event("auth:ready"));
    } catch (e) {
      errEl.textContent = "Could not reach the server. Check your connection.";
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  }

  function init() {
    document.getElementById("loginForm").addEventListener("submit", submitLogin);
    document.getElementById("logoutBtn").addEventListener("click", signOut);

    if (token) {
      // Cached token: reveal immediately; the first API call validates it
      // (onUnauthorized re-prompts if it has expired).
      reveal(true);
      window.dispatchEvent(new Event("auth:ready"));
    } else {
      reveal(false);
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
