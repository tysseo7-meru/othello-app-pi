/*
 * Node self-test for the Othello engine, CPU and ranking helpers.
 * Run: node tests/engine_test.js
 */
"use strict";
const assert = require("assert");
const E = require("../js/engine.js");
const CPU = require("../js/cpu.js");
const DB = require("../js/db.js");

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log("  ok -", name); }

console.log("Engine tests");

ok("initial board: 2 black, 2 white, 60 empty", () => {
  const c = E.countDiscs(E.initialBoard());
  assert.deepStrictEqual(c, { black: 2, white: 2, empty: 60 });
});

ok("initial legal moves for black = 4 specific squares, 1 flip each", () => {
  const moves = E.legalMoves(E.initialBoard(), E.BLACK);
  assert.strictEqual(moves.length, 4);
  const idx = moves.map(m => m.index).sort((a, b) => a - b);
  assert.deepStrictEqual(idx, [19, 26, 37, 44]); // (2,3) (3,2) (4,5) (5,4)
  moves.forEach(m => assert.strictEqual(m.flips.length, 1));
});

ok("applyMove flips only bracketed discs and rejects illegal moves", () => {
  const b = E.initialBoard();
  const next = E.applyMove(b, { index: 19 }, E.BLACK);
  assert.strictEqual(next[19], E.BLACK);
  assert.strictEqual(next[27], E.BLACK); // the flipped white disc
  assert.strictEqual(b[19], E.EMPTY);    // original board untouched
  assert.throws(() => E.applyMove(b, { index: 0 }, E.BLACK), /Illegal move/);
});

ok("20 random self-play games: legal flips only, counts always sum to 64", () => {
  for (let g = 0; g < 20; g++) {
    let board = E.initialBoard();
    let color = E.BLACK;
    let passes = 0, movesPlayed = 0;
    while (passes < 2 && !E.isFull(board)) {
      const moves = E.legalMoves(board, color);
      if (moves.length === 0) { passes++; color = E.opponent(color); continue; }
      passes = 0;
      const move = moves[Math.floor(Math.random() * moves.length)];
      // Every flipped disc must currently belong to the opponent.
      move.flips.forEach(i => assert.strictEqual(board[i], E.opponent(color)));
      assert.strictEqual(board[move.index], E.EMPTY);
      const before = E.countDiscs(board);
      board = E.applyMove(board, move, color);
      const after = E.countDiscs(board);
      assert.strictEqual(after.black + after.white + after.empty, 64);
      assert.strictEqual(
        (color === E.BLACK ? after.black : after.white),
        (color === E.BLACK ? before.black : before.white) + move.flips.length + 1
      );
      movesPlayed++;
      color = E.opponent(color);
    }
    const c = E.countDiscs(board);
    assert.strictEqual(c.black + c.white + c.empty, 64);
    assert.strictEqual(c.black + c.white, 4 + movesPlayed);
  }
});

ok("pass rule: a colour with no move passes while the opponent plays on", () => {
  // Board where White has no legal move but Black does:
  // row 0: B W . . ... with whites only reachable by black.
  const b = new Array(64).fill(E.EMPTY);
  b[0] = E.BLACK; b[1] = E.WHITE;
  assert.strictEqual(E.hasAnyMove(b, E.WHITE), false);
  assert.strictEqual(E.hasAnyMove(b, E.BLACK), true);
});

console.log("CPU tests");

["low", "mid", "high"].forEach(level => {
  ok(`CPU (${level}) returns a legal move on the initial board`, () => {
    const b = E.initialBoard();
    // The initial position is symmetric: White also has 4 legal moves
    // (Black moves first only by convention).
    assert.strictEqual(E.legalMoves(b, E.WHITE).length, 4);
    const m1 = CPU.chooseMove(b, E.WHITE, level);
    assert.ok(m1 && E.flipsFor(b, m1.index, E.WHITE).length > 0);
    // And after Black's first move, as White to move in a real game.
    const b2 = E.applyMove(b, E.legalMoves(b, E.BLACK)[0], E.BLACK);
    const m2 = CPU.chooseMove(b2, E.WHITE, level);
    assert.ok(m2 && E.flipsFor(b2, m2.index, E.WHITE).length > 0);
  });
});

ok("CPU returns null when the side to move has no legal move", () => {
  const b = new Array(64).fill(E.EMPTY);
  b[0] = E.BLACK; b[1] = E.WHITE;
  assert.strictEqual(CPU.chooseMove(b, E.WHITE, "mid"), null);
});

ok("CPU (high) finishes a full self-play game legally", () => {
  let board = E.initialBoard();
  let color = E.BLACK, passes = 0;
  while (passes < 2 && !E.isFull(board)) {
    const move = CPU.chooseMove(board, color, color === E.BLACK ? "mid" : "high");
    if (!move) { passes++; color = E.opponent(color); continue; }
    passes = 0;
    board = E.applyMove(board, move, color);
    color = E.opponent(color);
  }
  const c = E.countDiscs(board);
  assert.strictEqual(c.black + c.white + c.empty, 64);
});

console.log("Ranking helper tests");

ok("display name: free name is used as-is", () => {
  assert.strictEqual(DB._resolveDisplayName([], "p1", "alice"), "alice");
});
ok("display name: conflict with a different player gets (2), then (3)", () => {
  const recs = [{ playerId: "p1", displayName: "alice" }];
  assert.strictEqual(DB._resolveDisplayName(recs, "p2", "alice"), "alice(2)");
  recs.push({ playerId: "p2", displayName: "alice(2)" });
  assert.strictEqual(DB._resolveDisplayName(recs, "p3", "alice"), "alice(3)");
});
ok("display name: same player keeps its own name", () => {
  const recs = [{ playerId: "p1", displayName: "alice(2)" }];
  assert.strictEqual(DB._resolveDisplayName(recs, "p1", "alice"), "alice(2)");
});
ok("applyWin: increments total + level, merges same player, stamps updatedAt", () => {
  const recs = [];
  const r1 = DB._applyWin(recs, "p1", "bob", "mid", 1000);
  assert.strictEqual(r1.total, 1); assert.strictEqual(r1.mid, 1); assert.strictEqual(r1.updatedAt, 1000);
  const r2 = DB._applyWin(recs, "p1", "bob", "high", 2000);
  assert.strictEqual(r2.total, 2); assert.strictEqual(r2.high, 1); assert.strictEqual(r2.updatedAt, 2000);
  assert.strictEqual(recs.length, 1);
});
ok("sort: total desc, then earlier updatedAt first", () => {
  const recs = [
    { playerId: "a", displayName: "a", total: 3, updatedAt: 500 },
    { playerId: "b", displayName: "b", total: 5, updatedAt: 900 },
    { playerId: "c", displayName: "c", total: 3, updatedAt: 100 }
  ];
  const sorted = DB._sortRankings(recs);
  assert.deepStrictEqual(sorted.map(r => r.playerId), ["b", "c", "a"]);
});

console.log(`\nAll ${passed} tests passed.`);
