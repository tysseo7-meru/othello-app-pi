/*
 * DOM-level end-to-end test using jsdom (the sandbox's Chromium binary is
 * policy-blocked from standalone headless use, so this is the page-load
 * check: real HTML + real scripts + real localStorage, full game play).
 *
 * Requires jsdom:  npm install jsdom   (or NODE_PATH pointing at it)
 * Requires the app served at http://localhost:8901
 *   (cd .. && python3 -m http.server 8901)
 * Run: node tests/dom_test.js
 */
"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs");

const BASE = "http://localhost:8901/";
const RESET_KEY = fs.readFileSync(__dirname + "/../js/config.js", "utf8")
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
    if (await fn()) return;
    await sleep(200);
  }
  throw new Error("Timeout waiting for: " + label);
}

async function loadApp(url, seed) {
  const errors = [];
  const { VirtualConsole } = require("jsdom");
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => {
    // jsdom cannot play media; those stubs are expected noise, not app errors.
    if (/Not implemented/.test(e.message)) return;
    errors.push(e.detail && e.detail.message ? e.detail.message : e.message);
  });
  const dom = await JSDOM.fromURL(url, {
    resources: "usable",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      if (seed) seed(window);
    }
  });
  await waitFor(() => dom.window.document.readyState === "complete" &&
    !!dom.window.document.getElementById("start-btn"), 15000, "page load " + url);
  await sleep(400);
  return { dom, errors, window: dom.window, document: dom.window.document };
}

async function main() {
  console.log("Phase A: UI flow + full game (jsdom)");
  const { window, document, errors } = await loadApp(BASE);
  const $ = id => document.getElementById(id);

  ok("top screen visible", !$("screen-top").classList.contains("hidden"));
  ok("default language English", $("start-btn").textContent === "Start Game");
  ok("no script errors on load", errors.length === 0, errors.join(" | "));

  document.querySelector('#language-select button[data-lang="ja"]').click();
  ok("JA switch relabels start button", $("start-btn").textContent === "ゲームスタート");
  document.querySelector('#language-select button[data-lang="en"]').click();
  ok("EN switch restores English", $("start-btn").textContent === "Start Game");

  $("start-btn").click();
  ok("empty username blocked with error",
    !$("username-error").classList.contains("hidden") &&
    !$("screen-top").classList.contains("hidden"));

  $("username").value = "Tester";
  document.querySelector('#difficulty-select button[data-level="low"]').click();
  $("start-btn").click();
  await sleep(250);
  ok("countdown overlay appears", !$("countdown-overlay").classList.contains("hidden"));
  await waitFor(() =>
    $("countdown-overlay").classList.contains("hidden") &&
    $("turn-indicator").textContent === "Your turn" &&
    document.querySelectorAll("#board .disc").length === 4,
    9000, "countdown end + user turn");
  ok("board: 4 discs, NO legal-move hint markers",
    document.querySelectorAll("#board .disc").length === 4 &&
    document.querySelectorAll("#board .cell.legal").length === 0);

  let result = null;
  for (let i = 0; i < 600 && !result; i++) {
    if (!$("result-dialog").classList.contains("hidden")) {
      result = {
        title: $("result-title").textContent,
        saved: !$("result-saved").classList.contains("hidden")
      };
      break;
    }
    // No hint markers exist anymore: pick a legal move with the engine
    // from the board as rendered in the DOM, then click that cell.
    const clicked = window.eval(`(function(){
      if (document.getElementById('turn-indicator').textContent !== 'Your turn') return false;
      var cells = document.querySelectorAll('#board .cell');
      var board = [];
      cells.forEach(function(c){
        var d = c.querySelector('.disc');
        board.push(!d ? 0 : d.classList.contains('black') ? 1 : 2);
      });
      var moves = window.OthelloEngine.legalMoves(board, 1);
      if (!moves.length) return false;
      cells[moves[0].index].click();
      return true;
    })()`);
    await sleep(clicked ? 300 : 200);
  }
  ok("full game completed, result dialog shown", !!result, JSON.stringify(result));
  console.log("    game result:", JSON.stringify(result));
  const DB = window.RankingDB;
  const rankings = await DB.getRankings();
  ok("db mode is local", DB.mode === "local");
  if (result.title === "You Win!") {
    ok("win recorded for Tester",
      rankings.length === 1 && rankings[0].displayName === "Tester" && rankings[0].total >= 1,
      JSON.stringify(rankings));
    ok("saved note shown in dialog", result.saved === true);
  } else {
    ok("no record on " + result.title, rankings.length === 0, JSON.stringify(rankings));
    await DB.recordWin(window.localStorage.getItem("othello.playerId"), "Tester", "low");
  }

  console.log("Phase A2: (n) naming + ranking screen");
  const names = await (async () => {
    await DB.recordWin("dom-other", "Tester", "low");
    await DB.recordWin("dom-other", "Tester", "mid");
    await DB.recordWin("dom-third", "Tester", "high");
    return (await DB.getRankings()).map(r => r.displayName + ":" + r.total);
  })();
  ok("conflicts -> Tester(2), Tester(3); same player merges",
    names.includes("Tester(2):2") && names.includes("Tester(3):1"), JSON.stringify(names));

  await DB.resetAll();
  await DB.recordWin("p-a", "Alice", "low");
  await DB.recordWin("p-a", "Alice", "low");
  await sleep(5);
  await DB.recordWin("p-b", "Bob", "high");
  await DB.recordWin("p-b", "Bob", "mid");
  await DB.recordWin("p-c", "Carol", "low");
  $("result-dialog").classList.add("hidden");
  $("ranking-btn-top").click(); // handler works regardless of visible screen
  await waitFor(() => document.querySelectorAll("#ranking-body tr").length === 3, 8000, "ranking rows");
  const rows = Array.from(document.querySelectorAll("#ranking-body tr"))
    .map(tr => Array.from(tr.children).map(td => td.textContent).join("|"));
  ok("competition ranking rows (1|Alice|2, 1|Bob|2, 3|Carol|1)",
    rows[0].startsWith("1|Alice|2|") && rows[1].startsWith("1|Bob|2|") && rows[2].startsWith("3|Carol|1|"),
    JSON.stringify(rows));
  ok("no script errors during phase A", errors.length === 0, errors.join(" | "));
  window.close();

  console.log("Phase B: reset URL (fresh page, seeded storage)");
  const seedRecord = w => {
    w.localStorage.setItem("othello.rankings.v1", JSON.stringify({
      seed1: { playerId: "seed1", displayName: "Seed", total: 9, low: 9, mid: 0, high: 0, updatedAt: 1 }
    }));
  };
  const wrong = await loadApp(BASE + "?adm=reset&key=wrong", seedRecord);
  ok("wrong key: banner shown", !wrong.document.getElementById("banner").classList.contains("hidden"));
  ok("wrong key: data intact",
    (await wrong.window.RankingDB.getRankings()).length === 1);
  wrong.window.close();

  const right = await loadApp(BASE + "?adm=reset&key=" + RESET_KEY, seedRecord);
  ok("correct key: confirmation banner",
    right.document.getElementById("banner").textContent.includes("reset"));
  ok("correct key: rankings wiped",
    (await right.window.RankingDB.getRankings()).length === 0);
  right.window.close();

  console.log(`\nDOM test: all ${passed} checks passed.`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
