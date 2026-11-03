/*
 * Pi Network sign-in — Pi App Studio flow, static-frontend variant.
 *
 *   1. index.html loads the Pi SDK (https://sdk.minepi.com/pi-sdk.js),
 *      which provides window.Pi inside the Pi Browser. Outside it,
 *      window.Pi is absent or inert and this module quietly does nothing.
 *   2. Pi.init({ version: "2.0" }) (awaited, no "sandbox" argument), then
 *      Pi.authenticate(["username"], onIncompletePaymentFound) yields an
 *      accessToken. The uid/username returned by authenticate are NOT
 *      trusted (they come from the browser, which the end user controls)
 *      and are ignored.
 *   3. The accessToken is exchanged exactly once with App Studio:
 *        POST https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com/pi/auth/v1/login
 *        Content-Type: application/json
 *        { "accessToken": "<token>" }
 *      Only the { sessionToken, user: { uid, username } } in its HTTP 200
 *      response is treated as the player's identity. The sessionToken is
 *      kept in memory only — never written to localStorage.
 *   4. Any failure at any step (no SDK, init/authenticate throws, the
 *      exchange returns non-200 or fails) leaves the app in its normal
 *      manual-username mode. Nothing here ever calls the Pi Platform API
 *      (/v2/me) directly — only the SDK does that internally.
 */
(function (global) {
  "use strict";

  var LOGIN_URL = "https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com/pi/auth/v1/login";

  var status = "idle"; // idle -> pending -> signed-in | unavailable
  var sessionToken = null; // memory only, by design
  var user = null;         // { uid, username } — from the App Studio response ONLY
  var lastError = null;    // diagnostic: why sign-in failed (shown in the UI)
  var lastStep = "not started"; // diagnostic: which step the flow reached
  function setStep(s) { lastStep = s; emit(); }
  var listeners = [];
  var started = false;

  function emit() {
    listeners.slice().forEach(function (cb) {
      try { cb(api); } catch (e) { /* a listener error must not break sign-in */ }
    });
  }

  // This app takes no payments; the callback exists because
  // Pi.authenticate requires one. Log and ignore.
  function onIncompletePaymentFound(payment) {
    if (global.console && global.console.log) {
      global.console.log("[pi] incomplete payment found (ignored — this app takes no payments):",
        payment && payment.identifier ? payment.identifier : payment);
    }
  }

  function fail(reason) {
    status = "unavailable";
    lastError = String(reason);
    sessionToken = null;
    user = null;
    if (global.console && global.console.info) {
      global.console.info("[pi] Pi sign-in unavailable; continuing with manual username. (" + reason + ")");
    }
    emit();
  }

  function signIn() {
    if (started) return; // exactly one exchange per sign-in
    started = true;
    if (!global.Pi || typeof global.Pi.init !== "function" ||
        typeof global.Pi.authenticate !== "function") {
      fail("Pi SDK not present");
      return;
    }
    status = "pending";
    // Watchdog: if neither Pi.authenticate nor the App Studio exchange
    // answers within 60 s, surface that as the failure reason instead of
    // hanging silently in "pending" forever. (Raised from 20 s on
    // 2026-11-04: the App Studio backend was measured answering in
    // ~18 s, which left too little room for the whole chain.)
    setTimeout(function () {
      if (status === "pending") {
        fail("TIMEOUT: Pi sign-in produced no response within 60 seconds (Pi.authenticate or the App Studio exchange did not answer)");
      }
    }, 60000);
    Promise.resolve()
      .then(function () { setStep("step1: Pi.init called"); return global.Pi.init({ version: "2.0" }); })
      .then(function () { setStep("step2: Pi.init done; Pi.authenticate called"); return global.Pi.authenticate(["username"], onIncompletePaymentFound); })
      .then(function (auth) {
        if (!auth || !auth.accessToken) throw new Error("authenticate returned no accessToken");
        setStep("step3: authenticate answered (accessToken received); exchanging with App Studio");
        return global.fetch(LOGIN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: auth.accessToken })
        });
      })
      .then(function (res) {
        setStep("step4: App Studio exchange answered HTTP " + (res && res.status));
        if (!res || res.ok === false ||
            (typeof res.status === "number" && res.status !== 200)) {
          throw new Error("App Studio login HTTP " + (res && res.status));
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.sessionToken || !data.user ||
            !data.user.uid || !data.user.username) {
          throw new Error("App Studio login response missing sessionToken/user");
        }
        sessionToken = data.sessionToken;
        user = { uid: String(data.user.uid), username: String(data.user.username) };
        status = "signed-in";
        emit();
      })
      .catch(function (e) { fail(e && e.message ? e.message : String(e)); });
  }

  var api = {
    signIn: signIn,
    onChange: function (cb) {
      listeners.push(cb);
      if (status === "signed-in" || status === "unavailable") {
        try { cb(api); } catch (e) { /* see emit() */ }
      }
    },
    isSignedIn: function () { return status === "signed-in" && !!user; },
    getUser: function () { return user; },
    getStatus: function () { return status; },
    getLastError: function () { return lastError; },
    getLastStep: function () { return lastStep; },
    /* exposed for tests */
    _loginUrl: LOGIN_URL
  };

  global.PiAuth = api;
})(typeof window !== "undefined" ? window : globalThis);
