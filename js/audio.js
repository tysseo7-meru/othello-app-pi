/*
 * Audio: all sound is synthesized or generated locally — no external files
 * except the two countdown voice clips.
 *   - Stone "コト" click: WebAudio synthesis (wooden knock).
 *   - Button "ポチ" pop: WebAudio synthesis (short blip), played on
 *     every UI button press (wired by delegation in js/app.js).
 *   - BGM: Pachelbel, Canon in D major — our own WebAudio-synthesized
 *     rendition (public-domain composition, no recording, so no
 *     performer's rights are involved).
 *   - Countdown voice: assets/countdown_ja.mp3 / countdown_en.mp3
 *     (TTS-generated, pitch-shifted). Falls back to speechSynthesis
 *     with pitch 1.6 if a clip cannot be loaded/played.
 * Audio starts only after a user gesture (browser autoplay policy):
 * call unlock() from a click/tap handler.
 */
(function (global) {
  "use strict";

  var ctx = null;
  var masterGain = null;

  function ensureCtx() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function unlock() { ensureCtx(); }

  /* ---------- wooden "koto" click ---------- */
  function knock(when, volume, baseFreq) {
    var t = when;
    // Body: sine with fast pitch drop and exponential decay.
    var osc = ctx.createOscillator();
    var og = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, t + 0.045);
    og.gain.setValueAtTime(volume, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(og); og.connect(masterGain);
    osc.start(t); osc.stop(t + 0.12);
    // Transient: short filtered noise burst (the "click" attack).
    var len = Math.floor(ctx.sampleRate * 0.03);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var noise = ctx.createBufferSource(); noise.buffer = buf;
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = baseFreq * 1.8; bp.Q.value = 1.1;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(volume * 0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    noise.connect(bp); bp.connect(ng); ng.connect(masterGain);
    noise.start(t);
  }

  function playClick() {           // stone placement
    if (!ensureCtx()) return;
    knock(ctx.currentTime, 0.55, 1500);
  }
  function playFlip() {            // discs flipping (softer, lower)
    if (!ensureCtx()) return;
    knock(ctx.currentTime, 0.28, 1050);
  }

  /* ---------- button "ポチ" (pochi) pop ---------- */
  // Very short UI blip for button presses — deliberately unlike the
  // wooden stone knock: a fast triangle chirp sweeping down.
  function playPochi() {
    if (!ensureCtx()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.07);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(g); g.connect(masterGain);
    osc.start(t); osc.stop(t + 0.09);
  }

  /* ---------- BGM: Pachelbel — Canon in D major ---------- */
  // The composition is public domain (Pachelbel, d. 1706); this
  // arrangement is synthesized at runtime with WebAudio — our own
  // rendition, no recording is used, so no performer's rights are
  // involved.
  // The piece is built on a 2-bar ground: eight half-note chords
  // D – A – Bm – F#m – G – D – G – A under a bass ostinato, repeated
  // while the first violin's canon melody unfolds above flowing
  // arpeggios. We loop 8 ground passes (≈58 s): 2 passes of
  // introduction (bass + arpeggios, as in the piece), then the first
  // violin's famous figures — the half-note entry (F#–E–D–B,
  // A–B–C#), the descending quarter-note phrase, the eighth-note
  // figure, and the scale phrase (F#–E–D–C#–B–A–B–C#) — closing with
  // a reprise of the entry that leads straight back to pass 1.
  // Tempo: quarter ≈ 66, so one ground pass (8 beats) ≈ 7.27 s.
  var QUARTER_SEC = 60 / 66;
  var EIGHTH_SEC = QUARTER_SEC / 2;
  var PASS_SEC = QUARTER_SEC * 8;

  // Note-name ("C#3", "Bb2", "E#4" …) → frequency in Hz (equal temperament).
  function noteFreq(name) {
    var m = /^([A-G])(#|b)?(\d)$/.exec(name);
    if (!m) return null;
    var semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    var n = semis[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
    var midi = (parseInt(m[3], 10) + 1) * 12 + n;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Per chord of the ground: bass = the ostinato half note;
  // arp = 4 eighth-note chord tones (root–5th–root–3rd) flowing for
  // the chord's 2 beats.
  var CANON_CHORDS = [
    { chord: "D",   bass: "D2",  arp: ["D3", "A3", "D4", "F#4"] },
    { chord: "A",   bass: "A1",  arp: ["A2", "E3", "A3", "C#4"] },
    { chord: "Bm",  bass: "B1",  arp: ["B2", "F#3", "B3", "D4"] },
    { chord: "F#m", bass: "F#1", arp: ["F#2", "C#3", "F#3", "A3"] },
    { chord: "G",   bass: "G1",  arp: ["G2", "D3", "G3", "B3"] },
    { chord: "D",   bass: "D2",  arp: ["D3", "A3", "D4", "F#4"] },
    { chord: "G",   bass: "G1",  arp: ["G2", "D3", "G3", "B3"] },
    { chord: "A",   bass: "A1",  arp: ["A2", "E3", "A3", "C#4"] }
  ];

  // The first violin's figures, one entry per ground pass, melody as
  // [start (beats), note, length (beats)]. Passes 1–2 are the
  // introduction (bass + arpeggios only), as in the piece itself.
  var CANON_FIG = ["D5", "F#5", "A5", "G5", "F#5", "D5", "F#5", "E5"];
  var CANON_PASSES = [
    { mel: [] },                                                        // 1 introduction
    { mel: [] },                                                        // 2 introduction
    { mel: [[0, "F#5", 2], [2, "E5", 2], [4, "D5", 2], [6, "B4", 2]] }, // 3 entry: half notes
    { mel: [[0, "A4", 2], [2, "B4", 2], [4, "C#5", 4]] },               // 4 entry, continued
    { mel: [[0, "D5", 1], [1, "C#5", 1], [2, "B4", 1], [3, "A4", 1],
            [4, "G4", 1], [5, "F#4", 1], [6, "G4", 1], [7, "E4", 1]] }, // 5 descending quarters
    { mel: CANON_FIG.concat(CANON_FIG).map(function (n, i) {
        return [i * 0.5, n, 0.5];
      }) },                                                             // 6 eighth-note figure
    { mel: [[0, "F#5", 1], [1, "E5", 1], [2, "D5", 1], [3, "C#5", 1],
            [4, "B4", 1], [5, "A4", 1], [6, "B4", 1], [7, "C#5", 1]] }, // 7 scale phrase
    { mel: [[0, "F#5", 2], [2, "E5", 2], [4, "D5", 2], [6, "B4", 2]] }  // 8 reprise → loops to 1
  ];

  var bgm = { playing: false, timer: null, gain: null, pass: 0 };

  // Soft piano-ish voice: triangle fundamental + faint sine octave
  // partial through a lowpass, quick attack, gentle decay.
  function pianoNote(freq, t, dur, vol) {
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1800; lp.Q.value = 0.4;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + Math.min(0.6, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(bgm.gain);
    [{ type: "triangle", mult: 1, level: 1.0 },
     { type: "sine", mult: 2, level: 0.25 }].forEach(function (p) {
      var osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = freq * p.mult;
      var og = ctx.createGain(); og.gain.value = p.level;
      osc.connect(og); og.connect(lp);
      osc.start(t); osc.stop(t + dur + 0.05);
    });
  }

  // Soft string-ish voice for the canon melody: same partial recipe
  // as pianoNote but a slower attack and a sustained body, so the
  // line sings instead of plucking.
  function stringNote(freq, t, dur, vol) {
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2400; lp.Q.value = 0.3;
    var g = ctx.createGain();
    var rel = Math.min(0.25, dur * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.09);
    g.gain.exponentialRampToValueAtTime(vol * 0.8, t + Math.max(0.1, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(bgm.gain);
    [{ type: "triangle", mult: 1, level: 1.0 },
     { type: "sine", mult: 2, level: 0.25 }].forEach(function (p) {
      var osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = freq * p.mult;
      var og = ctx.createGain(); og.gain.value = p.level;
      osc.connect(og); og.connect(lp);
      osc.start(t); osc.stop(t + dur + 0.05);
    });
  }

  function schedulePass() {
    if (!bgm.playing) return;
    var t0 = ctx.currentTime + 0.06;
    var pass = CANON_PASSES[bgm.pass % CANON_PASSES.length];
    CANON_CHORDS.forEach(function (c, ci) {
      var ct = t0 + ci * 2 * QUARTER_SEC;        // each chord: 2 beats
      var f = noteFreq(c.bass);                  // ostinato half note
      if (f) pianoNote(f, ct, QUARTER_SEC * 2 * 0.98, 0.075);
      for (var i = 0; i < 4; i++) {              // flowing eighth arpeggio
        f = noteFreq(c.arp[i]);
        if (f) pianoNote(f, ct + i * EIGHTH_SEC, EIGHTH_SEC * 1.8, 0.026);
      }
    });
    pass.mel.forEach(function (m) {             // canon melody on top
      var f = noteFreq(m[1]);
      if (f) stringNote(f, t0 + m[0] * QUARTER_SEC, m[2] * QUARTER_SEC * 0.98, 0.05);
    });
    bgm.pass++;
    bgm.timer = setTimeout(schedulePass, PASS_SEC * 1000);
  }

  function bgmStart() {
    if (!ensureCtx() || bgm.playing) return;
    if (!bgm.gain) {
      bgm.gain = ctx.createGain();
      bgm.gain.gain.value = 1.0;
      bgm.gain.connect(masterGain);
    }
    bgm.playing = true;
    bgm.pass = 0;
    schedulePass();
  }
  function bgmStop() {
    bgm.playing = false;
    if (bgm.timer) { clearTimeout(bgm.timer); bgm.timer = null; }
  }
  function bgmIsPlaying() { return bgm.playing; }

  /* ---------- countdown voice ---------- */
  function speakFallback(lang) {
    try {
      var u = new SpeechSynthesisUtterance(
        lang === "ja" ? "3、2、1、ゲームスタート！" : "3, 2, 1, Game start!");
      u.lang = lang === "ja" ? "ja-JP" : "en-US";
      u.pitch = 1.6;               // childlike
      u.rate = 0.95;
      global.speechSynthesis.cancel();
      global.speechSynthesis.speak(u);
    } catch (e) { /* no voice available — visuals still run */ }
  }

  function playCountdownVoice(lang) {
    var src = lang === "ja" ? "assets/countdown_ja.mp3" : "assets/countdown_en.mp3";
    var fellBack = false;
    function fallback() { if (!fellBack) { fellBack = true; speakFallback(lang); } }
    try {
      var a = new Audio(src);
      a.addEventListener("error", fallback);
      var p = a.play();
      if (p && typeof p.catch === "function") p.catch(fallback);
    } catch (e) { fallback(); }
  }

  var api = {
    unlock: unlock,
    playClick: playClick,
    playFlip: playFlip,
    playPochi: playPochi,
    // Exposed for tests: the Canon arrangement data + note parser.
    _canon: { chords: CANON_CHORDS, passes: CANON_PASSES, noteFreq: noteFreq,
              quarterSec: QUARTER_SEC, passSec: PASS_SEC },
    bgmStart: bgmStart,
    bgmStop: bgmStop,
    bgmIsPlaying: bgmIsPlaying,
    playCountdownVoice: playCountdownVoice
  };
  global.GameAudio = api;
})(window);
