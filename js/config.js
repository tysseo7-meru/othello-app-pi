/*
 * App configuration.
 *
 * RESET_KEY: key for the ranking reset. Open the app with
 *   ?adm=reset&key=<RESET_KEY>
 * to wipe the ranking database (you will see a confirmation message).
 * NOTE: the GitHub repo for this app is PUBLIC (Akira's decision,
 * 2026-11-03), so this key is visible to anyone who reads the source.
 * It only keeps casual visitors from stumbling onto the reset; it is
 * not real access control.
 *
 * firebase: leave as null to run in LOCAL mode (rankings stored in the
 * browser's localStorage). In CLOUD mode (config filled in below),
 * js/db.js loads the official Firebase compat SDK from CDN and uses
 * Cloud Firestore collection "ranking".
 * Project: moco-othello-6e5c4 (Spark plan, Firestore asia-northeast1).
 */
window.APP_CONFIG = {
  RESET_KEY: "45f1365a654b514de403918c",
  firebase: {
    apiKey: "AIzaSyBsIRq3XTsDkIFj4sxzmGS9DgT53b2VMUs",
    authDomain: "moco-othello-6e5c4.firebaseapp.com",
    projectId: "moco-othello-6e5c4",
    storageBucket: "moco-othello-6e5c4.firebasestorage.app",
    messagingSenderId: "276791873988",
    appId: "1:276791873988:web:38b42f081c22e6361c5491",
    measurementId: "G-932K1V090N"
  }
};
