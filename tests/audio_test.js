/*
 * Audio data test: validates the Pachelbel Canon BGM arrangement data
 * in js/audio.js (the 8-chord ground progression, every note name
 * parses to a sane frequency, pass/melody structure is well-formed,
 * loop length in range) and that the sound entry points are safe to
 * call when no AudioContext exists (as in jsdom / Node).
 *
 * Run: node tests/audio_test.js
 */
"use strict";

let passed = 0;
function ok(name, cond, extra) {
  if (!cond) throw new Error("FAIL: " + name + (extra ? " — " + extra : ""));
  passed++; console.log("  ok -", name);
}

// audio.js is an IIFE over `window`; shim it with the Node global.
global.window = global;
require(__dirname + "/../js/audio.js");
const A = global.GameAudio;

ok("GameAudio exported", !!A);
ok("playPochi is a function", typeof A.playPochi === "function");
ok("playClick/playFlip still present",
   typeof A.playClick === "function" && typeof A.playFlip === "function");
ok("bgm controls still present",
   typeof A.bgmStart === "function" && typeof A.bgmStop === "function" &&
   typeof A.bgmIsPlaying === "function");

// No AudioContext in Node: every entry point must no-op, not throw.
A.unlock(); A.playPochi(); A.playClick(); A.playFlip(); A.bgmStart(); A.bgmStop();
ok("all entry points safe without AudioContext", A.bgmIsPlaying() === false);

const C = A._canon;
ok("canon data exposed", !!C && Array.isArray(C.chords) && Array.isArray(C.passes));
ok("quarter timing sane (quarter = 66)", Math.abs(C.quarterSec - 60 / 66) < 1e-9);
ok("pass = 8 beats", Math.abs(C.passSec - C.quarterSec * 8) < 1e-9);
const loopSec = C.passSec * C.passes.length;
ok("loop length within 40–70 s", loopSec >= 40 && loopSec <= 70, loopSec.toFixed(1) + " s");

ok("noteFreq: A4 = 440", Math.abs(C.noteFreq("A4") - 440) < 1e-6);
ok("noteFreq: D4 ≈ 293.66", Math.abs(C.noteFreq("D4") - 293.6648) < 0.01);
ok("noteFreq: F#4 ≈ 369.99", Math.abs(C.noteFreq("F#4") - 369.9944) < 0.01);
ok("noteFreq: C4 ≈ 261.63", Math.abs(C.noteFreq("C4") - 261.6256) < 0.01);
ok("noteFreq: garbage → null", C.noteFreq("H2") === null && C.noteFreq("C#") === null);

// The ground: D – A – Bm – F#m – G – D – G – A, bass D A B F# G D G A.
ok("progression has 8 chords", C.chords.length === 8);
ok("chord sequence is D A Bm F#m G D G A",
   C.chords.map(c => c.chord).join(" ") === "D A Bm F#m G D G A",
   C.chords.map(c => c.chord).join(" "));
ok("bass ostinato is D A B F# G D G A",
   C.chords.map(c => c.bass.replace(/[0-9]/g, "")).join(" ") === "D A B F# G D G A",
   C.chords.map(c => c.bass).join(" "));

let arpNotes = 0;
C.chords.forEach((c, i) => {
  const label = "chord " + (i + 1) + " (" + c.chord + ")";
  const fb = C.noteFreq(c.bass);
  ok(label + ": bass " + c.bass + " parses", typeof fb === "number" && fb > 15 && fb < 5000);
  ok(label + ": 4 arpeggio notes", Array.isArray(c.arp) && c.arp.length === 4);
  c.arp.forEach(n => {
    const f = C.noteFreq(n);
    ok(label + ": arp note " + n + " parses", typeof f === "number" && f > 15 && f < 5000);
    arpNotes++;
  });
});
ok("total arpeggio notes = 32", arpNotes === 32);

// Passes: 2 introduction passes (no melody), then melody passes whose
// notes all sit inside the 8-beat pass.
ok("arrangement has 8 passes", C.passes.length === 8);
ok("passes 1–2 are introduction (no melody)",
   C.passes[0].mel.length === 0 && C.passes[1].mel.length === 0);
let melNotes = 0;
C.passes.forEach((p, i) => {
  const label = "pass " + (i + 1);
  if (i >= 2) ok(label + ": has melody", Array.isArray(p.mel) && p.mel.length >= 1);
  p.mel.forEach(m => {
    const f = C.noteFreq(m[1]);
    ok(label + ": melody " + m[1] + " parses", typeof f === "number" && f > 15 && f < 5000);
    ok(label + ": melody span inside the pass",
       m[0] >= 0 && m[2] > 0 && m[0] + m[2] <= 8,
       "start " + m[0] + " len " + m[2]);
    melNotes++;
  });
});
ok("melody notes present (>= 40)", melNotes >= 40, String(melNotes));

// The signature phrases, verbatim.
ok("pass 3 entry = F#5 E5 D5 B4 (half notes)",
   C.passes[2].mel.map(m => m[1]).join(" ") === "F#5 E5 D5 B4" &&
   C.passes[2].mel.every(m => m[2] === 2));
ok("pass 4 = A4 B4 C#5",
   C.passes[3].mel.map(m => m[1]).join(" ") === "A4 B4 C#5");
ok("pass 7 scale phrase = F#5 E5 D5 C#5 B4 A4 B4 C#5",
   C.passes[6].mel.map(m => m[1]).join(" ") === "F#5 E5 D5 C#5 B4 A4 B4 C#5");
ok("pass 8 reprises the entry (seamless loop)",
   C.passes[7].mel.map(m => m[1]).join(" ") ===
   C.passes[2].mel.map(m => m[1]).join(" "));

console.log("\n" + passed + " checks passed");
