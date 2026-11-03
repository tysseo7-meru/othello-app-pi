/*
 * Othello app controller: screens, game flow, countdown, ranking UI.
 * The user always plays Black (first move); the CPU plays White.
 */
(function () {
  "use strict";

  var E = window.OthelloEngine;
  var CPU = window.OthelloCPU;
  var DB = window.RankingDB;
  var Snd = window.GameAudio;
  var I = window.I18n;
  var BLACK = E.BLACK, WHITE = E.WHITE;

  var LS = {
    lang: "othello.lang",
    username: "othello.username",
    level: "othello.level",
    bgm: "othello.bgm",
    playerId: "othello.playerId",
    gset: "othello.gset"
  };

  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- persistent identity & settings ---------- */
  function getPlayerId() {
    var id = localStorage.getItem(LS.playerId);
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
      localStorage.setItem(LS.playerId, id);
    }
    return id;
  }
  var playerId = getPlayerId();
  // Pi identity (App Studio-verified) once Pi sign-in succeeds; null in
  // the manual-username fallback. Set only from js/pi.js's App Studio
  // exchange response — never from Pi.authenticate's return value.
  var piUser = null;
  function currentPlayerId() { return piUser ? "pi:" + piUser.uid : playerId; }
  var lang = localStorage.getItem(LS.lang) || "en";
  var level = localStorage.getItem(LS.level) || "mid";
  var bgmOn = localStorage.getItem(LS.bgm) === "1";
  // Legal-move guide markers, switched by URL parameter (?gset=on /
  // ?gset=off, user request 2026-11-03): the parameter wins and is
  // remembered in localStorage; without it the remembered choice
  // applies; the default is ON (guides shown unless switched off).
  var guidesOn = (function () {
    var p = null;
    try { p = new URLSearchParams(window.location.search).get("gset"); } catch (e) {}
    if (p === "on" || p === "off") {
      localStorage.setItem(LS.gset, p);
      return p === "on";
    }
    return localStorage.getItem(LS.gset) !== "off";
  })();
  I.setLang(lang);

  /* ---------- banner ---------- */
  var bannerTimer = null;
  function showBanner(msg, isError) {
    var b = $("banner");
    b.textContent = msg;
    b.classList.toggle("error-banner", !!isError);
    b.classList.remove("hidden");
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.classList.add("hidden"); }, 4500);
  }

  /* ---------- screens ---------- */
  function showScreen(name) {
    ["top", "game", "ranking"].forEach(function (s) {
      $("screen-" + s).classList.toggle("hidden", s !== name);
    });
  }

  /* ---------- i18n ---------- */
  function applyLanguage() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = I.t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.placeholder = I.t(el.getAttribute("data-i18n-placeholder"));
    });
    document.querySelectorAll("#language-select button").forEach(function (b) {
      b.classList.toggle("selected", b.getAttribute("data-lang") === lang);
    });
    document.querySelectorAll("#difficulty-select button").forEach(function (b) {
      b.classList.toggle("selected", b.getAttribute("data-level") === level);
    });
    $("difficulty-label").textContent = I.levelName(level);
    updateBgmButtons();
    updateTurnIndicator();
    if (piUser) $("pi-signedin").textContent = I.t("piSignedInAs") + ": " + piUser.username;
  }

  /* ---------- BGM ---------- */
  function updateBgmButtons() {
    ["bgm-toggle-top", "bgm-toggle-game"].forEach(function (id) {
      var b = $(id);
      b.textContent = I.t("bgmLabel") + ": " + (bgmOn ? I.t("bgmOn") : I.t("bgmOff"));
      b.classList.toggle("on", bgmOn);
    });
  }
  function setBgm(on) {
    bgmOn = on;
    localStorage.setItem(LS.bgm, on ? "1" : "0");
    if (on) { Snd.unlock(); Snd.bgmStart(); } else { Snd.bgmStop(); }
    updateBgmButtons();
  }
  // Autoplay policy: start BGM on the first user gesture if the pref is on.
  document.addEventListener("pointerdown", function firstGesture() {
    document.removeEventListener("pointerdown", firstGesture);
    if (bgmOn) { Snd.unlock(); Snd.bgmStart(); }
  });

  /* ---------- game state ---------- */
  var board = E.initialBoard();
  var turn = BLACK;
  var busy = true;          // input locked during countdown / CPU / animations
  var gameOver = true;      // no game running yet
  var movesPlayed = 0;
  var rankingReturn = "top";
  var cellEls = [];

  function buildBoard() {
    var boardEl = $("board");
    boardEl.innerHTML = "";
    cellEls = [];
    for (var i = 0; i < 64; i++) {
      var cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("data-index", i);
      cell.addEventListener("click", onCellTap);
      boardEl.appendChild(cell);
      cellEls.push(cell);
    }
  }

  function render(anim) {
    var counts = E.countDiscs(board);
    $("score-black").textContent = counts.black;
    $("score-white").textContent = counts.white;
    // Legal-move guide markers: when ?gset=on, the player's legal
    // cells are dotted (the .legal style); otherwise no markers are
    // shown. Legal moves are always computed by the engine for the
    // CPU and to validate taps (see the tap handler).
    var markSet = null;
    if (guidesOn && !gameOver && turn === BLACK && !anim) {
      markSet = {};
      E.legalMoves(board, BLACK).forEach(function (m) { markSet[m.index] = true; });
    }
    for (var i = 0; i < 64; i++) {
      var cell = cellEls[i];
      cell.classList.toggle("legal", !!(markSet && markSet[i] && board[i] === E.EMPTY));
      var v = board[i];
      var disc = cell.querySelector(".disc");
      if (v === E.EMPTY) {
        if (disc) disc.remove();
        continue;
      }
      var colorClass = v === BLACK ? "black" : "white";
      if (!disc) {
        disc = document.createElement("div");
        disc.className = "disc " + colorClass;
        cell.appendChild(disc);
      }
      if (anim && anim.flips && anim.flips.indexOf(i) >= 0) {
        // Render in the OLD colour, half-flipped; swap colour mid-animation.
        var oldClass = v === BLACK ? "white" : "black";
        disc.className = "disc " + oldClass + " half";
        (function (d, cc) {
          setTimeout(function () {
            d.className = "disc " + cc;
            Snd.playFlip();
          }, 170);
        })(disc, colorClass);
      } else {
        disc.className = "disc " + colorClass + (anim && anim.placed === i ? " placed" : "");
      }
    }
    updateTurnIndicator();
  }

  function updateTurnIndicator() {
    var el = $("turn-indicator");
    if (!el) return;
    if (gameOver) { el.textContent = ""; return; }
    el.textContent = turn === BLACK ? I.t("yourTurn") : I.t("cpuTurn");
  }

  function showGameMessage(key) {
    $("game-message").textContent = key ? I.t(key) : "";
  }

  /* ---------- game flow ---------- */
  function startGame() {
    var name;
    if (piUser) {
      // Pi-signed-in: the player name is the Pi username, verified by
      // App Studio. No manual name is asked for or needed.
      name = piUser.username;
      $("username-error").classList.add("hidden");
    } else {
      name = $("username").value.trim();
      if (!name) {
        $("username-error").classList.remove("hidden");
        $("username").focus();
        return;
      }
      $("username-error").classList.add("hidden");
    }
    localStorage.setItem(LS.username, name);
    Snd.unlock();

    board = E.initialBoard();
    turn = BLACK;
    busy = true;
    gameOver = false;
    movesPlayed = 0;
    showGameMessage("");
    $("difficulty-label").textContent = I.levelName(level);
    showScreen("game");
    render();
    runCountdown().then(function () {
      busy = false;
      advance();
    });
  }

  function runCountdown() {
    var overlay = $("countdown-overlay");
    var num = $("countdown-number");
    overlay.classList.remove("hidden");
    Snd.playCountdownVoice(lang);
    var seq = ["3", "2", "1", I.t("countdownStart")];
    var chain = Promise.resolve();
    seq.forEach(function (label, idx) {
      chain = chain.then(function () {
        num.textContent = label;
        num.classList.remove("pop");
        void num.offsetWidth; // restart animation
        num.classList.add("pop");
        return sleep(idx === seq.length - 1 ? 650 : 800);
      });
    });
    return chain.then(function () { overlay.classList.add("hidden"); });
  }

  function advance() {
    render();
    if (gameOver) return;
    var userMoves = E.legalMoves(board, BLACK);
    var cpuMoves = E.legalMoves(board, WHITE);
    if (userMoves.length === 0 && cpuMoves.length === 0) { endGame(); return; }
    if (turn === BLACK) {
      if (userMoves.length === 0) {
        busy = true;
        showGameMessage("youPass");
        turn = WHITE;
        setTimeout(function () { showGameMessage(""); advance(); }, 1200);
        return;
      }
      busy = false;
      render(); // input open (no hint markers are shown)
    } else {
      if (cpuMoves.length === 0) {
        busy = true;
        showGameMessage("cpuPass");
        turn = BLACK;
        setTimeout(function () { showGameMessage(""); advance(); }, 1200);
        return;
      }
      busy = true;
      render();
      setTimeout(cpuPlay, 600); // natural pacing
    }
  }

  function doMove(move, color) {
    Snd.unlock();
    Snd.playClick();
    board = E.applyMove(board, move, color);
    movesPlayed++;
    render({ placed: move.index, flips: move.flips });
  }

  function cpuPlay() {
    if (gameOver) return;
    var move = CPU.chooseMove(board, WHITE, level);
    if (!move) { advance(); return; } // safety; advance() handles passes
    doMove(move, WHITE);
    turn = BLACK;
    setTimeout(advance, 420); // let the flip animation read clearly
  }

  function onCellTap(ev) {
    if (busy || gameOver || turn !== BLACK) return;
    var idx = parseInt(ev.currentTarget.getAttribute("data-index"), 10);
    var moves = E.legalMoves(board, BLACK);
    var move = null;
    for (var i = 0; i < moves.length; i++) if (moves[i].index === idx) { move = moves[i]; break; }
    if (!move) return;
    busy = true;
    doMove(move, BLACK);
    turn = WHITE;
    setTimeout(advance, 420);
  }

  function endGame() {
    gameOver = true;
    busy = true;
    render();
    var counts = E.countDiscs(board);
    var resultKey = counts.black > counts.white ? "resultWin"
      : counts.black < counts.white ? "resultLose" : "resultDraw";
    $("result-title").textContent = I.t(resultKey);
    $("result-score").textContent =
      I.t("you") + " " + counts.black + " — " + counts.white + " " + I.t("cpu");
    $("result-saved").classList.add("hidden");
    if (counts.black > counts.white) {
      var name = piUser ? piUser.username
        : (localStorage.getItem(LS.username) || $("username").value.trim());
      DB.recordWin(currentPlayerId(), name, level).then(function () {
        $("result-saved").classList.remove("hidden");
      }).catch(function () { /* ranking save failed; the game result stands */ });
    }
    setTimeout(function () { $("result-dialog").classList.remove("hidden"); }, 650);
  }

  /* ---------- ranking ---------- */
  function openRanking(from) {
    rankingReturn = from;
    showScreen("ranking");
    $("ranking-status").textContent = I.t("loadingRanking");
    $("ranking-body").innerHTML = "";
    $("ranking-empty").classList.add("hidden");
    DB.getRankings().then(function (records) {
      $("ranking-status").textContent = "";
      var tbody = $("ranking-body");
      var shown = 0, rank = 0, prevTotal = null;
      records.forEach(function (r, idx) {
        if (r.total !== prevTotal) { rank = idx + 1; prevTotal = r.total; } // competition ranking
        if (rank > 30) return;                                               // rank cut, ties included
        shown++;
        var tr = document.createElement("tr");
        if (r.playerId === currentPlayerId()) tr.className = "me";
        [rank, r.displayName, r.total, r.low + " / " + r.mid + " / " + r.high].forEach(function (val, ci) {
          var td = document.createElement("td");
          if (ci === 1) td.className = "name";
          td.textContent = val;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      if (shown === 0) $("ranking-empty").classList.remove("hidden");
    }).catch(function (e) {
      $("ranking-status").textContent = I.t("rankingLoadFailed") + (e && e.message ? e.message : e);
    });
  }

  /* ---------- reset (?adm=reset&key=...) ---------- */
  function handleReset() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("adm") !== "reset") return;
    var key = params.get("key") || "";
    history.replaceState(null, "", window.location.pathname);
    if (key !== (window.APP_CONFIG && window.APP_CONFIG.RESET_KEY)) {
      showBanner(I.t("resetFailed") + "invalid key", true);
      return;
    }
    DB.resetAll().then(function () {
      showBanner(I.t("resetDone"), false);
    }).catch(function (e) {
      showBanner(I.t("resetFailed") + (e && e.message ? e.message : e), true);
    });
  }

  /* ---------- Pi sign-in identity ---------- */
  // Runs when js/pi.js reports a settled sign-in. On success the
  // Pi-Browser-only gate lifts, the top screen shows the App
  // Studio-verified Pi username, the manual name input is hidden, and
  // wins are recorded under "pi:<uid>". On failure (no Pi SDK / not in
  // Pi Browser / exchange failed) the gate stays up with the
  // Pi-Browser-only notice — this build has no manual-username fallback.
  function applyPiIdentity() {
    if (!window.PiAuth) return;
    if (!window.PiAuth.isSignedIn()) {
      // Pi-Browser-only gate: sign-in failed or timed out, so this is not
      // a working Pi Browser session — keep the gate up with the notice.
      if (window.PiAuth.getStatus() === "unavailable") {
        $("pi-gate-title").textContent = I.t("piOnlyTitle");
        $("pi-gate-body").textContent = I.t("piOnlyBody");
      }
      return;
    }
    $("pi-gate").classList.add("hidden");
    var u = window.PiAuth.getUser();
    if (!u) return;
    piUser = { uid: u.uid, username: u.username };
    $("username").value = u.username;
    $("username").disabled = true;
    $("username-block").classList.add("hidden");
    var el = $("pi-signedin");
    el.textContent = I.t("piSignedInAs") + ": " + u.username;
    el.classList.remove("hidden");
    $("username-error").classList.add("hidden");
  }

  /* ---------- wiring ---------- */
  function init() {
    buildBoard();
    $("username").value = localStorage.getItem(LS.username) || "";

    // Button "ポチ" pop: one delegated listener covers every current
    // and future <button> (start, difficulty, language, BGM toggles,
    // ranking, dialogs). Board cells are <div>s, so the stone "コト"
    // sound stays separate and is not doubled.
    document.addEventListener("pointerdown", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("button")) {
        Snd.playPochi();
      }
    });

    document.querySelectorAll("#difficulty-select button").forEach(function (b) {
      b.addEventListener("click", function () {
        level = b.getAttribute("data-level");
        localStorage.setItem(LS.level, level);
        applyLanguage();
      });
    });
    document.querySelectorAll("#language-select button").forEach(function (b) {
      b.addEventListener("click", function () {
        lang = b.getAttribute("data-lang");
        localStorage.setItem(LS.lang, lang);
        I.setLang(lang);
        applyLanguage();
      });
    });
    $("username").addEventListener("input", function () {
      $("username-error").classList.add("hidden");
    });

    $("bgm-toggle-top").addEventListener("click", function () { setBgm(!bgmOn); });
    $("bgm-toggle-game").addEventListener("click", function () { setBgm(!bgmOn); });
    $("start-btn").addEventListener("click", startGame);
    $("ranking-btn-top").addEventListener("click", function () { openRanking("top"); });

    $("back-to-top-btn").addEventListener("click", function () {
      if (!gameOver && movesPlayed > 0) {
        $("confirm-dialog").classList.remove("hidden");
      } else {
        gameOver = true;
        showScreen("top");
      }
    });
    $("confirm-leave-btn").addEventListener("click", function () {
      $("confirm-dialog").classList.add("hidden");
      gameOver = true; busy = true;
      showScreen("top");
    });
    $("confirm-cancel-btn").addEventListener("click", function () {
      $("confirm-dialog").classList.add("hidden");
    });

    $("result-ranking-btn").addEventListener("click", function () {
      $("result-dialog").classList.add("hidden");
      openRanking("game");
    });
    $("result-again-btn").addEventListener("click", function () {
      $("result-dialog").classList.add("hidden");
      startGame();
    });
    $("result-top-btn").addEventListener("click", function () {
      $("result-dialog").classList.add("hidden");
      showScreen("top");
    });
    $("ranking-back-btn").addEventListener("click", function () {
      showScreen(rankingReturn === "game" ? "game" : "top");
    });

    applyLanguage();
    handleReset();
    showScreen("top");

    // Pi sign-in (js/pi.js): attempted once on load; silently falls back
    // to the manual username flow when unavailable.
    if (window.PiAuth) {
      // Pi-Browser-only gate: while sign-in is being decided the gate
      // shows only a neutral loading message (never the Pi-Browser-only
      // notice, so Pi Browser users never see it); applyPiIdentity hides
      // the gate on success or swaps in the notice on failure.
      $("pi-gate-title").textContent = I.t("appTitle");
      $("pi-gate-body").textContent = I.t("piGateLoading");
      window.PiAuth.onChange(applyPiIdentity);
      window.PiAuth.signIn();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
