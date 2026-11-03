/*
 * End-to-end browser test via Chrome DevTools Protocol (no dependencies).
 * Requires: the app served on http://localhost:8901 and a Chromium binary.
 * Run: node tests/e2e_cdp.js
 */
"use strict";
const { spawn } = require("child_process");

const CHROME = process.env.CHROME_BIN || "/opt/meta-chromium/chrome";
const BASE = "http://localhost:8901/";
const RESET_KEY = require("fs").readFileSync(__dirname + "/../js/config.js", "utf8")
  .match(/RESET_KEY:\s*"([^"]+)"/)[1];

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
function ok(name, cond, extra) {
  if (!cond) throw new Error("FAIL: " + name + (extra ? " — " + extra : ""));
  passed++; console.log("  ok -", name);
}

async function waitFor(fn, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await sleep(250);
  }
  throw new Error("Timeout waiting for: " + label);
}

async function main() {
  const chrome = spawn(CHROME, [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    "--remote-debugging-port=9223", "--user-data-dir=/tmp/chrome-e2e",
    "--autoplay-policy=no-user-gesture-required", BASE
  ], { stdio: "ignore" });

  let ws, msgId = 0;
  const pending = new Map();
  const consoleErrors = [];
  const exceptions = [];

  try {
    // Find the page target.
    let target = null;
    await waitFor(async () => {
      try {
        const list = await (await fetch("http://localhost:9223/json/list")).json();
        target = list.find(t => t.type === "page" && t.url.startsWith(BASE));
        return !!target;
      } catch (e) { return false; }
    }, 15000, "devtools page target");

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        consoleErrors.push(m.params.args.map(a => a.value || a.description || "").join(" "));
      }
      if (m.method === "Runtime.exceptionThrown") {
        exceptions.push(m.params.exceptionDetails.text + " " +
          (m.params.exceptionDetails.exception || {}).description);
      }
    };
    const send = (method, params) => new Promise(res => {
      const id = ++msgId;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
    const evaluate = async expr => {
      const r = await send("Runtime.evaluate",
        { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result.exceptionDetails) {
        throw new Error("evaluate failed: " + expr.slice(0, 80) + " -> " +
          JSON.stringify(r.result.exceptionDetails).slice(0, 300));
      }
      return r.result.result.value;
    };

    await send("Runtime.enable");
    await send("Page.enable");
    await waitFor(async () =>
      await evaluate("document.readyState === 'complete' && !!document.getElementById('start-btn')"),
      15000, "page load");
    await sleep(600);

    console.log("Top screen");
    ok("top screen visible", await evaluate("!document.getElementById('screen-top').classList.contains('hidden')"));
    ok("default language is English", await evaluate("document.getElementById('start-btn').textContent") === "Start Game");
    ok("no console errors on top screen", consoleErrors.length === 0, consoleErrors.join(" | "));
    ok("no uncaught exceptions on top screen", exceptions.length === 0, exceptions.join(" | "));

    console.log("i18n");
    await evaluate("document.querySelector('#language-select button[data-lang=\"ja\"]').click()");
    ok("JA switch relabels Start button", await evaluate("document.getElementById('start-btn').textContent") === "ゲームスタート");
    await evaluate("document.querySelector('#language-select button[data-lang=\"en\"]').click()");
    ok("EN switch restores English", await evaluate("document.getElementById('start-btn').textContent") === "Start Game");

    console.log("Username validation");
    await evaluate("document.getElementById('start-btn').click()");
    ok("empty username shows error and stays on top",
      await evaluate("!document.getElementById('username-error').classList.contains('hidden') && !document.getElementById('screen-top').classList.contains('hidden')"));

    console.log("Game start + countdown");
    await evaluate("document.getElementById('username').value = 'Tester'");
    await evaluate("document.querySelector('#difficulty-select button[data-level=\"low\"]').click()");
    await evaluate("document.getElementById('start-btn').click()");
    await sleep(300);
    ok("countdown overlay appears", await evaluate("!document.getElementById('countdown-overlay').classList.contains('hidden')"));
    await waitFor(async () =>
      await evaluate("document.querySelectorAll('#board .cell.legal').length === 4"),
      8000, "countdown end + 4 legal hints");
    ok("board shows 4 discs and 4 legal-move hints",
      await evaluate("document.querySelectorAll('#board .disc').length") === 4);

    console.log("Playing a full game vs low CPU (first legal move each time)");
    let result = null;
    for (let i = 0; i < 500 && !result; i++) {
      result = await evaluate(`(function(){
        var dlg = document.getElementById('result-dialog');
        if (!dlg.classList.contains('hidden')) {
          return { title: document.getElementById('result-title').textContent,
                   score: document.getElementById('result-score').textContent,
                   saved: !document.getElementById('result-saved').classList.contains('hidden') };
        }
        var cell = document.querySelector('#board .cell.legal');
        if (cell) cell.click();
        return null;
      })()`);
      if (!result) await sleep(200);
    }
    ok("game completed and result dialog shown", !!result);
    console.log("    result:", JSON.stringify(result));

    console.log("Ranking DB (local mode, real browser localStorage)");
    const after = await evaluate(`(async function(){
      var out = {};
      out.rankings = await RankingDB.getRankings();
      out.mode = RankingDB.mode;
      return out;
    })()`);
    ok("db mode is local", after.mode === "local");
    if (result.title === "You Win!") {
      ok("win was recorded for Tester",
        after.rankings.length === 1 && after.rankings[0].displayName === "Tester" && after.rankings[0].total >= 1,
        JSON.stringify(after.rankings));
      ok("result dialog showed the saved note", result.saved === true);
    } else {
      ok("no win recorded on " + result.title, after.rankings.length === 0);
      // Seed a win through the real DB API so ranking UI can be checked.
      await evaluate("RankingDB.recordWin(RankingDB && localStorage.getItem('othello.playerId'), 'Tester', 'low')");
    }

    console.log("Display-name (n) rule through the real DB layer");
    const names = await evaluate(`(async function(){
      await RankingDB.recordWin('e2e-other-player', 'Tester', 'low');
      await RankingDB.recordWin('e2e-other-player', 'Tester', 'mid');
      await RankingDB.recordWin('e2e-third-player', 'Tester', 'high');
      var rs = await RankingDB.getRankings();
      return rs.map(function(r){ return r.displayName + ':' + r.total; });
    })()`);
    ok("conflicting names become Tester(2) / Tester(3), same player merges",
      names.includes("Tester(2):2") && names.includes("Tester(3):1"), JSON.stringify(names));

    console.log("Ranking screen");
    await evaluate("RankingDB.resetAll()"); // clean slate: re-seed deterministic rows
    await evaluate(`(async function(){
      await RankingDB.recordWin('p-a', 'Alice', 'low');
      await RankingDB.recordWin('p-a', 'Alice', 'low');
      await RankingDB.recordWin('p-b', 'Bob', 'high');
      await RankingDB.recordWin('p-b', 'Bob', 'mid');
      await RankingDB.recordWin('p-c', 'Carol', 'low');
    })()`);
    await send("Page.navigate", { url: BASE });
    await waitFor(async () =>
      await evaluate("document.readyState === 'complete' && !!document.getElementById('ranking-btn-top')"),
      10000, "reload");
    await sleep(400);
    await evaluate("document.getElementById('ranking-btn-top').click()");
    await waitFor(async () =>
      await evaluate("document.querySelectorAll('#ranking-body tr').length === 3"),
      8000, "ranking rows");
    const rows = await evaluate(`Array.from(document.querySelectorAll('#ranking-body tr')).map(function(tr){
      return Array.from(tr.children).map(function(td){ return td.textContent; }).join('|');
    })`);
    ok("competition ranks + totals correct (Alice 1st, Bob 1st-tie order by time, Carol 3rd)",
      rows[0].startsWith("1|Alice|2|") && rows[1].startsWith("1|Bob|2|") && rows[2].startsWith("3|Carol|1|"),
      JSON.stringify(rows));

    console.log("Reset URL");
    await send("Page.navigate", { url: BASE + "?adm=reset&key=wrong" });
    await waitFor(async () =>
      await evaluate("!document.getElementById('banner').classList.contains('hidden')"), 8000, "wrong-key banner");
    ok("wrong key does NOT reset",
      await evaluate("(await RankingDB.getRankings()).length") === 3);
    await send("Page.navigate", { url: BASE + "?adm=reset&key=" + RESET_KEY });
    await waitFor(async () =>
      await evaluate("!document.getElementById('banner').classList.contains('hidden')"), 8000, "reset banner");
    ok("correct key shows confirmation",
      (await evaluate("document.getElementById('banner').textContent")).includes("reset"));
    ok("rankings are empty after reset",
      await evaluate("(await RankingDB.getRankings()).length") === 0);

    ok("no console errors during the whole session", consoleErrors.length === 0, consoleErrors.join(" | "));
    ok("no uncaught exceptions during the whole session", exceptions.length === 0, exceptions.join(" | "));

    console.log(`\nE2E: all ${passed} checks passed.`);
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    chrome.kill("SIGKILL");
  }
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
