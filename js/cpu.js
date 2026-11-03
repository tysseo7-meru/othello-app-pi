/*
 * CPU opponent — three difficulty levels.
 *   low : noisy 1-ply greedy (randomness dominates; makes mistakes)
 *   mid : positional greedy (corners first, avoids corner-adjacent squares
 *         while the corner is empty, flips as tiebreak)
 *   high: alpha-beta minimax (depth 6) with positional + mobility evaluation,
 *         exact endgame search when <= 12 squares remain empty.
 * Pure logic; works in browser (window.OthelloCPU) and Node.
 */
(function (global) {
  "use strict";

  var E = (typeof module !== "undefined" && module.exports)
    ? require("./engine.js")
    : global.OthelloEngine;

  var WEIGHTS = [
    120, -20,  20,   5,   5,  20, -20, 120,
    -20, -40,  -5,  -5,  -5,  -5, -40, -20,
     20,  -5,  15,   3,   3,  15,  -5,  20,
      5,  -5,   3,   3,   3,   3,  -5,   5,
      5,  -5,   3,   3,   3,   3,  -5,   5,
     20,  -5,  15,   3,   3,  15,  -5,  20,
    -20, -40,  -5,  -5,  -5,  -5, -40, -20,
    120, -20,  20,   5,   5,  20, -20, 120
  ];
  var CORNERS = [0, 7, 56, 63];

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------- low ---------- */
  function moveLow(board, color, moves) {
    if (Math.random() < 0.3) return pickRandom(moves); // pure random blunders
    var best = -Infinity, bestMoves = [];
    for (var i = 0; i < moves.length; i++) {
      // light greedy signal (flip count) buried in heavy noise
      var score = moves[i].flips.length + Math.random() * 7;
      if (score > best + 0.001) { best = score; bestMoves = [moves[i]]; }
      else if (Math.abs(score - best) <= 0.001) bestMoves.push(moves[i]);
    }
    return pickRandom(bestMoves);
  }

  /* ---------- mid ---------- */
  function moveMid(board, color, moves) {
    var best = -Infinity, bestMoves = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var score = WEIGHTS[m.index] * 10 + m.flips.length; // position first, flips tiebreak
      if (score > best) { best = score; bestMoves = [m]; }
      else if (score === best) bestMoves.push(m);
    }
    return pickRandom(bestMoves);
  }

  /* ---------- high: alpha-beta ---------- */
  function evaluate(board, color) {
    var opp = E.opponent(color);
    var counts = E.countDiscs(board);
    var pos = 0, myDiscs = 0, oppDiscs = 0, i;
    for (i = 0; i < 64; i++) {
      if (board[i] === color) { pos += WEIGHTS[i]; myDiscs++; }
      else if (board[i] === opp) { pos -= WEIGHTS[i]; oppDiscs++; }
    }
    // Corner occupancy dominates everything else.
    var cornerScore = 0;
    for (i = 0; i < CORNERS.length; i++) {
      if (board[CORNERS[i]] === color) cornerScore += 900;
      else if (board[CORNERS[i]] === opp) cornerScore -= 900;
    }
    // Mobility.
    var myMob = E.legalMoves(board, color).length;
    var oppMob = E.legalMoves(board, opp).length;
    var mobScore = 12 * (myMob - oppMob);
    // Disc count only matters a little before the endgame.
    var discScore = (counts.empty > 12) ? (myDiscs - oppDiscs) : 0;
    return pos + cornerScore + mobScore + discScore;
  }

  function terminalScore(board, color) {
    var counts = E.countDiscs(board);
    var mine = color === E.BLACK ? counts.black : counts.white;
    var theirs = color === E.BLACK ? counts.white : counts.black;
    var diff = mine - theirs;
    return diff * 100 + (diff > 0 ? 10000 : diff < 0 ? -10000 : 0);
  }

  function alphabeta(board, color, rootColor, depth, alpha, beta, exact) {
    var counts = E.countDiscs(board);
    if (counts.empty === 0) return terminalScore(board, rootColor);
    var moves = E.legalMoves(board, color);
    var opp = E.opponent(color);
    if (moves.length === 0) {
      if (!E.hasAnyMove(board, opp)) return terminalScore(board, rootColor);
      return alphabeta(board, opp, rootColor, depth, alpha, beta, exact); // pass
    }
    if (!exact && depth === 0) return evaluate(board, rootColor);
    // Order moves by positional weight for better pruning.
    moves.sort(function (a, b) { return WEIGHTS[b.index] - WEIGHTS[a.index]; });
    var i, val;
    if (color === rootColor) {
      val = -Infinity;
      for (i = 0; i < moves.length; i++) {
        var next = E.applyMove(board, moves[i], color);
        val = Math.max(val, alphabeta(next, opp, rootColor, exact ? depth : depth - 1, alpha, beta, exact));
        alpha = Math.max(alpha, val);
        if (alpha >= beta) break;
      }
      return val;
    } else {
      val = Infinity;
      for (i = 0; i < moves.length; i++) {
        var next2 = E.applyMove(board, moves[i], color);
        val = Math.min(val, alphabeta(next2, opp, rootColor, exact ? depth : depth - 1, alpha, beta, exact));
        beta = Math.min(beta, val);
        if (alpha >= beta) break;
      }
      return val;
    }
  }

  function moveHigh(board, color, moves) {
    var counts = E.countDiscs(board);
    var exact = counts.empty <= 12;
    var depth = exact ? counts.empty : 6;
    var best = -Infinity, bestMoves = [];
    for (var i = 0; i < moves.length; i++) {
      var next = E.applyMove(board, moves[i], color);
      var val = alphabeta(next, E.opponent(color), color, depth - 1, -Infinity, Infinity, exact);
      // tiny positional jitter so equal moves vary between games
      val += WEIGHTS[moves[i].index] * 0.001;
      if (val > best + 1e-9) { best = val; bestMoves = [moves[i]]; }
      else if (Math.abs(val - best) <= 1e-9) bestMoves.push(moves[i]);
    }
    return pickRandom(bestMoves);
  }

  /**
   * Choose a move for `color` at difficulty `level` ("low"|"mid"|"high").
   * Returns a move object { index, flips } or null if no legal move.
   */
  function chooseMove(board, color, level) {
    var moves = E.legalMoves(board, color);
    if (moves.length === 0) return null;
    if (level === "low") return moveLow(board, color, moves);
    if (level === "mid") return moveMid(board, color, moves);
    return moveHigh(board, color, moves);
  }

  var api = { chooseMove: chooseMove, WEIGHTS: WEIGHTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OthelloCPU = api;
})(typeof window !== "undefined" ? window : globalThis);
