/*
 * Othello (Reversi) rules engine — pure logic, no DOM.
 * Board: Array(64), index = row * 8 + col. Values: EMPTY=0, BLACK=1, WHITE=2.
 * Works in the browser (window.OthelloEngine) and in Node (module.exports)
 * so the self-test in tests/engine_test.js can verify the rules.
 */
(function (global) {
  "use strict";

  var EMPTY = 0, BLACK = 1, WHITE = 2;
  var DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  function opponent(color) { return color === BLACK ? WHITE : BLACK; }

  function initialBoard() {
    var b = new Array(64).fill(EMPTY);
    b[27] = WHITE; b[28] = BLACK; // d4 white, e4 black
    b[35] = BLACK; b[36] = WHITE; // d5 black, e5 white
    return b;
  }

  function inBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  /* All discs that would flip if `color` plays at index `idx` (empty cell). */
  function flipsFor(board, idx, color) {
    if (board[idx] !== EMPTY) return [];
    var r = Math.floor(idx / 8), c = idx % 8, opp = opponent(color);
    var all = [];
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1];
      var line = [], nr = r + dr, nc = c + dc;
      while (inBoard(nr, nc) && board[nr * 8 + nc] === opp) {
        line.push(nr * 8 + nc);
        nr += dr; nc += dc;
      }
      if (line.length > 0 && inBoard(nr, nc) && board[nr * 8 + nc] === color) {
        all = all.concat(line);
      }
    }
    return all;
  }

  /* Legal moves for `color`: [{ index, flips: [indices] }] */
  function legalMoves(board, color) {
    var moves = [];
    for (var i = 0; i < 64; i++) {
      if (board[i] !== EMPTY) continue;
      var f = flipsFor(board, i, color);
      if (f.length > 0) moves.push({ index: i, flips: f });
    }
    return moves;
  }

  function hasAnyMove(board, color) {
    for (var i = 0; i < 64; i++) {
      if (board[i] === EMPTY && flipsFor(board, i, color).length > 0) return true;
    }
    return false;
  }

  /* Returns a NEW board with the move applied. Throws on an illegal move. */
  function applyMove(board, move, color) {
    var flips = flipsFor(board, move.index, color);
    if (flips.length === 0) throw new Error("Illegal move at " + move.index);
    var next = board.slice();
    next[move.index] = color;
    for (var i = 0; i < flips.length; i++) next[flips[i]] = color;
    return next;
  }

  function countDiscs(board) {
    var black = 0, white = 0, empty = 0;
    for (var i = 0; i < 64; i++) {
      if (board[i] === BLACK) black++;
      else if (board[i] === WHITE) white++;
      else empty++;
    }
    return { black: black, white: white, empty: empty };
  }

  function isFull(board) { return board.indexOf(EMPTY) === -1; }

  var api = {
    EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE,
    opponent: opponent,
    initialBoard: initialBoard,
    flipsFor: flipsFor,
    legalMoves: legalMoves,
    hasAnyMove: hasAnyMove,
    applyMove: applyMove,
    countDiscs: countDiscs,
    isFull: isFull
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OthelloEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
