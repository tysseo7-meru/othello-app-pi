/*
 * Internationalization: full EN/JA string table for every UI string.
 * Default language is English; the choice persists in localStorage.
 */
(function (global) {
  "use strict";

  var STRINGS = {
    en: {
      appTitle: "Othello",
      appSubtitle: "Play against the CPU",
      usernameLabel: "Username",
      usernamePlaceholder: "Enter your name",
      usernameRequired: "Please enter a username first.",
      piSignedInAs: "Signed in with Pi as",
      difficultyLabel: "Difficulty",
      levelLow: "Low",
      levelMid: "Mid",
      levelHigh: "High",
      startGame: "Start Game",
      viewRanking: "Ranking",
      languageLabel: "Language",
      bgmLabel: "BGM",
      bgmOn: "ON",
      bgmOff: "OFF",
      youAreBlack: "You are Black (first move)",
      black: "Black",
      white: "White",
      you: "You",
      cpu: "CPU",
      yourTurn: "Your turn",
      cpuTurn: "CPU is thinking…",
      youPass: "No legal move — you pass.",
      cpuPass: "CPU has no move — CPU passes.",
      backToTop: "Back to Top",
      confirmLeave: "Leave this game and return to the top screen? Nothing will be recorded.",
      leaveYes: "Leave",
      cancel: "Cancel",
      resultWin: "You Win!",
      resultLose: "You Lose",
      resultDraw: "Draw",
      resultSaved: "Your win was saved to the ranking.",
      finalScore: "Final score",
      playAgain: "Play Again",
      rankingTitle: "Ranking",
      rankingEmpty: "No wins recorded yet. Be the first!",
      rankColRank: "Rank",
      rankColName: "Username",
      rankColTotal: "Total Wins",
      rankColLevels: "Low / Mid / High",
      back: "Back",
      resetDone: "The ranking database has been reset.",
      resetFailed: "Reset failed: ",
      countdownStart: "START!",
      levelPrefix: "Level: ",
      loadingRanking: "Loading ranking…",
      rankingLoadFailed: "Could not load the ranking: "
    },
    ja: {
      appTitle: "オセロ",
      appSubtitle: "CPUと対戦しよう",
      usernameLabel: "ユーザー名",
      usernamePlaceholder: "名前を入力してください",
      usernameRequired: "先にユーザー名を入力してください。",
      piSignedInAs: "Piでサインイン中",
      difficultyLabel: "難易度",
      levelLow: "低",
      levelMid: "中",
      levelHigh: "高",
      startGame: "ゲームスタート",
      viewRanking: "ランキング",
      languageLabel: "言語",
      bgmLabel: "BGM",
      bgmOn: "オン",
      bgmOff: "オフ",
      youAreBlack: "あなたは黒（先手）です",
      black: "黒",
      white: "白",
      you: "あなた",
      cpu: "CPU",
      yourTurn: "あなたの番です",
      cpuTurn: "CPUが考え中…",
      youPass: "置ける場所がありません — パスします。",
      cpuPass: "CPUは置ける場所がありません — パスします。",
      backToTop: "トップに戻る",
      confirmLeave: "このゲームを中断してトップに戻りますか？記録は残りません。",
      leaveYes: "戻る",
      cancel: "キャンセル",
      resultWin: "あなたの勝ち！",
      resultLose: "あなたの負け",
      resultDraw: "引き分け",
      resultSaved: "勝ちをランキングに保存しました。",
      finalScore: "最終スコア",
      playAgain: "もう一度遊ぶ",
      rankingTitle: "ランキング",
      rankingEmpty: "まだ勝ちの記録がありません。最初の勝者になろう！",
      rankColRank: "順位",
      rankColName: "ユーザー名",
      rankColTotal: "トータル勝ち数",
      rankColLevels: "低 / 中 / 高",
      back: "戻る",
      resetDone: "ランキングのデータベースをリセットしました。",
      resetFailed: "リセットに失敗しました：",
      countdownStart: "スタート！",
      levelPrefix: "難易度：",
      loadingRanking: "ランキングを読み込み中…",
      rankingLoadFailed: "ランキングを読み込めませんでした："
    }
  };

  var current = "en";

  function setLang(lang) { if (STRINGS[lang]) current = lang; }
  function getLang() { return current; }
  function t(key) {
    return (STRINGS[current] && STRINGS[current][key]) || STRINGS.en[key] || key;
  }
  function levelName(level) {
    return t(level === "low" ? "levelLow" : level === "mid" ? "levelMid" : "levelHigh");
  }

  var api = { STRINGS: STRINGS, setLang: setLang, getLang: getLang, t: t, levelName: levelName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.I18n = api;
})(typeof window !== "undefined" ? window : globalThis);
