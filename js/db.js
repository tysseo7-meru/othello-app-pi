/*
 * Ranking data layer — one interface, two backends.
 *
 *   LOCAL mode (default): records in localStorage. Used when
 *     window.APP_CONFIG.firebase is null.
 *   CLOUD mode: Cloud Firestore via the official Firebase compat SDK
 *     loaded from CDN. Used when window.APP_CONFIG.firebase is set.
 *     Collection: "ranking", document id = playerId.
 *
 * Record: { playerId, displayName, total, low, mid, high, updatedAt }
 *   updatedAt = epoch ms of the win that produced the current totals.
 *
 * Display-name rule: a player keeps the displayName assigned at their
 * first recorded win. That name is their chosen username, unless a
 * DIFFERENT playerId already holds it — then it is "name(n)" with the
 * smallest free natural number n >= 2. The same playerId always merges
 * into its own record.
 */
(function (global) {
  "use strict";

  var LS_KEY = "othello.rankings.v1";
  var LEVELS = ["low", "mid", "high"];

  /* ---------- shared helpers ---------- */

  function resolveDisplayName(records, playerId, desiredName) {
    var i, taken = {};
    for (i = 0; i < records.length; i++) {
      if (records[i].playerId === playerId) return records[i].displayName;
      taken[records[i].displayName] = true;
    }
    if (!taken[desiredName]) return desiredName;
    var n = 2;
    while (taken[desiredName + "(" + n + ")"]) n++;
    return desiredName + "(" + n + ")";
  }

  function applyWin(records, playerId, username, level, now) {
    var displayName = resolveDisplayName(records, playerId, username);
    var rec = null, i;
    for (i = 0; i < records.length; i++) {
      if (records[i].playerId === playerId) { rec = records[i]; break; }
    }
    if (!rec) {
      rec = { playerId: playerId, displayName: displayName, total: 0, low: 0, mid: 0, high: 0, updatedAt: now };
      records.push(rec);
    }
    rec.total += 1;
    if (LEVELS.indexOf(level) >= 0) rec[level] += 1;
    rec.updatedAt = now;
    return rec;
  }

  function sortRankings(records) {
    return records.slice().sort(function (a, b) {
      if (b.total !== a.total) return b.total - a.total;      // most wins first
      return a.updatedAt - b.updatedAt;                        // earlier achiever first
    });
  }

  /* ---------- local backend ---------- */

  var localBackend = {
    name: "local",
    loadAll: function () {
      try {
        var raw = global.localStorage.getItem(LS_KEY);
        if (!raw) return Promise.resolve([]);
        var obj = JSON.parse(raw);
        return Promise.resolve(Object.keys(obj).map(function (k) { return obj[k]; }));
      } catch (e) { return Promise.reject(e); }
    },
    saveAll: function (records) {
      var obj = {};
      records.forEach(function (r) { obj[r.playerId] = r; });
      global.localStorage.setItem(LS_KEY, JSON.stringify(obj));
      return Promise.resolve();
    },
    clear: function () {
      global.localStorage.removeItem(LS_KEY);
      return Promise.resolve();
    }
  };

  /* ---------- Firebase (Firestore) backend ---------- */

  var firestorePromise = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }
  function getFirestore() {
    if (!firestorePromise) {
      firestorePromise = loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js")
        .then(function () { return loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"); })
        .then(function () {
          if (!global.firebase.apps.length) global.firebase.initializeApp(global.APP_CONFIG.firebase);
          return global.firebase.firestore();
        });
    }
    return firestorePromise;
  }

  var cloudBackend = {
    name: "cloud",
    loadAll: function () {
      return getFirestore().then(function (db) {
        return db.collection("ranking").get().then(function (snap) {
          var out = [];
          snap.forEach(function (doc) { out.push(doc.data()); });
          return out;
        });
      });
    },
    saveAll: function (records) {
      return getFirestore().then(function (db) {
        var batch = db.batch();
        records.forEach(function (r) { batch.set(db.collection("ranking").doc(r.playerId), r); });
        return batch.commit();
      });
    },
    clear: function () {
      return getFirestore().then(function (db) {
        return db.collection("ranking").get().then(function (snap) {
          var batch = db.batch();
          snap.forEach(function (doc) { batch.delete(doc.ref); });
          return batch.commit();
        });
      });
    }
  };

  /* ---------- public API ---------- */

  var backend = (global.APP_CONFIG && global.APP_CONFIG.firebase) ? cloudBackend : localBackend;

  var api = {
    mode: backend.name,

    /** Record a win for playerId at the given level. Resolves to the saved record. */
    recordWin: function (playerId, username, level) {
      return backend.loadAll().then(function (records) {
        var rec = applyWin(records, playerId, username, level, Date.now());
        return backend.saveAll(records).then(function () { return rec; });
      });
    },

    /** All ranking records, sorted (total desc, updatedAt asc). */
    getRankings: function () {
      return backend.loadAll().then(sortRankings);
    },

    /** Delete every ranking record. */
    resetAll: function () { return backend.clear(); },

    /* exposed for tests */
    _resolveDisplayName: resolveDisplayName,
    _applyWin: applyWin,
    _sortRankings: sortRankings
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.RankingDB = api;
})(typeof window !== "undefined" ? window : globalThis);
