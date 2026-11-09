// =========================================================
// Firebase configuration
// ---------------------------------------------------------
// Paste the config object from the Firebase console here
// (Project settings → General → Your apps → Web app → SDK setup).
// See README.md, "Set up Firebase".
//
// These values are NOT secrets. Firebase web configs are meant to be
// public. Your data is protected by the rules in database.rules.json.
// =========================================================

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "dinnertime-d4d88.firebaseapp.com",
  databaseURL: "https://dinnertime-d4d88-default-rtdb.firebaseio.com",
  projectId: "dinnertime-d4d88",
  storageBucket: "dinnertime-d4d88.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000",
};

// How many restaurant matches to show on the results screen.
export const MAX_RESULTS = 5;
