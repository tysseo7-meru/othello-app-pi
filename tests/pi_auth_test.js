/*
 * Pi sign-in (Pi App Studio flow) DOM test, using jsdom.
 *
 * Runs against the local-mode test copy served at http://localhost:8901
 * (same copy as the other DOM tests: js/config.js has firebase:null, and
 * the Pi SDK <script src="https://sdk.minepi.com/pi-sdk.js"> tag is
 * stripped from index.html so that window.Pi is fully controlled here:
 *   Phase A — no window.Pi at all: the app must load with zero script
 *             errors and the manual username flow must be intact.
 *   Phase B — window.Pi is stubbed (init/authenticate) and fetch is
 *             stubbed: the App Studio exchange must be POSTed exactly
 *             once with the accessToken, and the identity the app uses
 *             must be the App Studio response's uid/username — NOT the
 *             browser-supplied ones from Pi.authenticate. A full game is
 *             then played (high-CPU advisor vs low CPU, as in
 *             dom_win_test) and the win must be recorded under
 *             playerId "pi:REALUID" with displayName "realname".
 *             The sessionToken must not appear in localStorage.
 *
 * Run: NODE_PATH=<jsdom node_modules> node tests/pi_auth_test.js
 */
"use strict";
const { JSDOM, VirtualConsole } = require("jsdom");

const BASE = "http://localhost:8901/";
const LOGIN_URL = "https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com/pi/auth/v1/login";
const SESSION_TOKEN = "sess-SECRET-9f8e7d6c";

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
function ok(name, cond, extra) {
  if (!cond) throw new Error("FAIL: " + name + (extra ? " — " + extra : ""));
  passed++; console.log("  ok -", name);
}
async function waitFor(fn, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return;
    await sleep(200);
  }
  throw new Error("Timeout waiting for: " + label);
}

async function loadApp(seed) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => {
    if (/Not implemented/.test(e.message)) return; // media stubs, expected noise
    errors.push(e.detail && e.detail.message ? e.detail.message : e.message);
  });
  const dom = await JSDOM.fromURL(BASE, {
    resources: "usable",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) { if (seed) seed(window); }
  });
  await waitFor(() => dom.window.document.readyState === "complete" &&
    !!dom.window.document.getElementById("start-btn"), 15000, "page load");
  await sleep(400);
  return { dom, errors, window: dom.window, document: dom.window.document };
}

async function playAdvisorGame(window, document) {
  const $ = id => document.getElementById(id);
  await waitFor(() =>
    $("countdown-overlay").classList.contains("hidden") &&
    $("turn-indicator").textContent === "Your turn", 9000, "game start");
  let title = null;
  for (let i = 0; i < 600 && !title; i++) {
    if (!$("result-dialog").classList.contains("hidden")) {
      title = $("result-title").textContent;
      break;
    }
    const clicked = window.eval(`(function(){
      var cells = document.querySelectorAll('#board .cell');
      if (document.getElementById('turn-indicator').textContent !== 'Your turn') return false;
      var board = [];
      cells.forEach(function(c){
        var d = c.querySelector('.disc');
        board.push(!d ? 0 : d.classList.contains('black') ? 1 : 2);
      });
      var mv = window.OthelloCPU.chooseMove(board, 1, 'high');
      if (!mv) return false;
      cells[mv.index].click();
      return true;
    })()`);
    await sleep(clicked ? 350 : 200);
  }
  return title;
}

async function main() {
  /* ---------- Phase A: no window.Pi — manual flow intact ---------- */
  console.log("Phase A: no Pi SDK (normal browser)");
  {
    const { window, document, errors } = await loadApp(null);
    const $ = id => document.getElementById(id);
    await sleep(600); // let the sign-in attempt settle (it must fail soft)
    ok("no script errors on load", errors.length === 0, errors.join(" | "));
    ok("PiAuth module present, status unavailable",
      !!window.PiAuth && window.PiAuth.getStatus() === "unavailable",
      window.PiAuth && window.PiAuth.getStatus());
    ok("PiAuth not signed in", window.PiAuth.isSignedIn() === false);
    ok("username block visible", !$("username-block").classList.contains("hidden"));
    ok("username input enabled", $("username").disabled === false);
    ok("pi-signedin note hidden", $("pi-signedin").classList.contains("hidden"));

    $("username").value = "Manual";
    document.querySelector('#difficulty-select button[data-level="low"]').click();
    $("start-btn").click();
    await waitFor(() =>
      $("countdown-overlay").classList.contains("hidden") &&
      $("turn-indicator").textContent === "Your turn", 9000, "manual game start");
    ok("manual game starts and reaches user turn", true);
    ok("no script errors in manual flow", errors.length === 0, errors.join(" | "));
    window.close();
  }

  /* ---------- Phase B: stubbed Pi + stubbed App Studio exchange ---------- */
  console.log("Phase B: Pi sign-in via App Studio exchange");
  {
    const fetchCalls = [];
    const captured = {};
    const { window, document, errors } = await loadApp(w => {
      w.Pi = {
        init: async opts => { captured.initOpts = opts; },
        authenticate: async (scopes, onIncomplete) => {
          captured.scopes = scopes;
          captured.onIncompleteType = typeof onIncomplete;
          return { accessToken: "tok123", user: { uid: "BROWSERUID", username: "browsername" } };
        }
      };
      w.fetch = async (url, opts) => {
        fetchCalls.push({ url, opts });
        return {
          status: 200,
          ok: true,
          json: async () => ({
            sessionToken: SESSION_TOKEN,
            user: { uid: "REALUID", username: "realname" }
          })
        };
      };
    });
    const $ = id => document.getElementById(id);
    await waitFor(() => !$("pi-signedin").classList.contains("hidden"), 8000, "pi sign-in applied");

    ok("Pi.init called with exactly { version: '2.0' } (no sandbox)",
      !!captured.initOpts && captured.initOpts.version === "2.0" &&
      Object.keys(captured.initOpts).length === 1,
      JSON.stringify(captured.initOpts));
    ok("authenticate scopes = ['username'], callback is a function",
      JSON.stringify(captured.scopes) === '["username"]' && captured.onIncompleteType === "function");
    ok("exchange POSTed exactly once to the App Studio login URL",
      fetchCalls.length === 1 && fetchCalls[0].url === LOGIN_URL,
      JSON.stringify(fetchCalls.map(c => c.url)));
    ok("exchange body carries the accessToken from authenticate",
      fetchCalls[0].opts.method === "POST" &&
      JSON.parse(fetchCalls[0].opts.body).accessToken === "tok123",
      fetchCalls[0].opts.body);
    ok("PiAuth status signed-in with App Studio identity",
      window.PiAuth.isSignedIn() &&
      window.PiAuth.getUser().uid === "REALUID" &&
      window.PiAuth.getUser().username === "realname",
      JSON.stringify(window.PiAuth.getUser()));
    ok("top screen shows the App Studio username (not the browser one)",
      $("pi-signedin").textContent.includes("realname") &&
      !$("pi-signedin").textContent.includes("browsername"),
      $("pi-signedin").textContent);
    ok("username block hidden and input disabled",
      $("username-block").classList.contains("hidden") && $("username").disabled === true);

    let lsDump = "";
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      lsDump += k + "=" + window.localStorage.getItem(k) + ";";
    }
    ok("sessionToken is NOT in localStorage", !lsDump.includes(SESSION_TOKEN), lsDump);

    // Play a full game and check where the win lands.
    document.querySelector('#difficulty-select button[data-level="low"]').click();
    $("start-btn").click();
    const title = await playAdvisorGame(window, document);
    ok("advisor beat the low CPU (You Win!)", title === "You Win!", "title=" + title);
    await sleep(300);
    const recs = await window.RankingDB.getRankings();
    ok("win recorded under pi:REALUID as 'realname'",
      recs.length === 1 && recs[0].playerId === "pi:REALUID" &&
      recs[0].displayName === "realname" && recs[0].total === 1,
      JSON.stringify(recs));
    ok("no record uses the browser-supplied uid/username",
      !JSON.stringify(recs).includes("BROWSERUID") && !JSON.stringify(recs).includes("browsername"),
      JSON.stringify(recs));
    ok("still exactly one exchange after the game", fetchCalls.length === 1);
    lsDump = "";
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      lsDump += k + "=" + window.localStorage.getItem(k) + ";";
    }
    ok("sessionToken still NOT in localStorage after the game", !lsDump.includes(SESSION_TOKEN));
    ok("no script errors in Pi flow", errors.length === 0, errors.join(" | "));
    window.close();
  }

  console.log(`\nPi auth test: all ${passed} checks passed.`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
