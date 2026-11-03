/*
 * Win-path DOM test: plays a real game in jsdom where the user's moves are
 * picked by the high-level CPU logic (as an advisor) against the low CPU.
 * Verifies: user win -> result dialog "You Win!" + saved note + a ranking
 * record for the player's own playerId in localStorage.
 * Run (server on :8901, jsdom installed):
 *   NODE_PATH=<jsdom node_modules> node tests/dom_win_test.js
 */
"use strict";
const { JSDOM, VirtualConsole } = require("jsdom");
const BASE = "http://localhost:8901/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
function ok(name, cond, extra) {
  if (!cond) throw new Error("FAIL: " + name + (extra ? " — " + extra : ""));
  passed++; console.log("  ok -", name);
}
async function waitFor(fn, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await fn()) return; await sleep(200); }
  throw new Error("Timeout waiting for: " + label);
}

async function main() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = await JSDOM.fromURL(BASE, {
    resources: "usable", runScripts: "dangerously",
    pretendToBeVisual: true, virtualConsole: vc
  });
  const { window } = dom, document = window.document;
  const $ = id => document.getElementById(id);
  await waitFor(() => document.readyState === "complete" && !!$("start-btn"), 15000, "load");
  await sleep(300);

  $("username").value = "Champ";
  document.querySelector('#difficulty-select button[data-level="low"]').click();
  $("start-btn").click();
  await waitFor(() =>
    $("countdown-overlay").classList.contains("hidden") &&
    $("turn-indicator").textContent === "Your turn", 9000, "game start");

  // Play: reconstruct the board from the DOM, ask the high CPU for the move.
  let title = null;
  for (let i = 0; i < 600; i++) {
    if (!$("result-dialog").classList.contains("hidden")) {
      title = $("result-title").textContent;
      break;
    }
    const clicked = window.eval(`(function(){
      var cells = document.querySelectorAll('#board .cell');
      // No hint markers are rendered anymore; the turn indicator is
      // the signal that input is open for the user.
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
  ok("game finished", !!title);
  ok("advisor beat the low CPU (You Win!)", title === "You Win!", "title=" + title);
  await sleep(300);
  ok("saved note visible", !$("result-saved").classList.contains("hidden"));
  const recs = await window.RankingDB.getRankings();
  const mine = recs.find(r => r.playerId === window.localStorage.getItem("othello.playerId"));
  ok("win recorded under own playerId as 'Champ' (low=1, total=1)",
    !!mine && mine.displayName === "Champ" && mine.total === 1 && mine.low === 1,
    JSON.stringify(recs));
  ok("no script errors", errors.length === 0, errors.join(" | "));
  window.close();
  console.log(`\nWin-path DOM test: all ${passed} checks passed.`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
