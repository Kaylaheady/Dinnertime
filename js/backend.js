// =========================================================
// backend.js: everything that talks to Firebase lives here.
// If you ever switch to Supabase (or anything else), this is the
// only file you'd need to rewrite.
//
// Data shape in the Realtime Database:
//
//   sessions/
//     ABCDE/
//       createdAt: 1731100000000
//       participants/
//         <firebase-uid>/
//           name: "Sam"
//           cuisines: { "thai": true, "sushi": true }
//           updatedAt: 1731100050000
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, get, set, onValue, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";

// Session codes skip look-alike characters (0/O, 1/I/L) so they're easy to read aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;

let db = null;
let uid = null;

/** True if config.js still contains the placeholder values. */
export function isConfigured() {
  return !firebaseConfig.apiKey.startsWith("YOUR_");
}

/**
 * Initialise Firebase and sign in anonymously.
 * Anonymous auth gives every phone a stable ID (remembered by the browser)
 * so each person can only edit their own picks.
 * @returns {Promise<string>} this device's user ID
 */
export async function connect() {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  const cred = await signInAnonymously(getAuth(app));
  uid = cred.user.uid;
  return uid;
}

/** Normalise whatever the user typed into a valid-looking code. */
export function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/**
 * Create a new session with a unique code.
 * Uses a transaction so two people can never grab the same code.
 * @returns {Promise<string>} the new session code
 */
export async function createSession() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const result = await runTransaction(
      ref(db, `sessions/${code}/createdAt`),
      (current) => (current === null ? Date.now() : undefined), // undefined = abort
    );
    if (result.committed) return code;
  }
  throw new Error("Couldn't create a session. Please try again.");
}

/** @returns {Promise<boolean>} whether a session with this code exists */
export async function sessionExists(code) {
  const snap = await get(ref(db, `sessions/${code}/createdAt`));
  return snap.exists();
}

/**
 * Listen for live changes to a session's participants.
 * @param {string} code
 * @param {(participants: Array<{id:string,name:string,cuisines:string[]}>) => void} callback
 * @returns {() => void} call this to stop listening
 */
export function watchParticipants(code, callback) {
  return onValue(ref(db, `sessions/${code}/participants`), (snap) => {
    const raw = snap.val() || {};
    const list = Object.entries(raw).map(([id, p]) => ({
      id,
      name: p.name,
      cuisines: Object.keys(p.cuisines || {}),
      updatedAt: p.updatedAt || 0,
    }));
    list.sort((a, b) => a.updatedAt - b.updatedAt); // order people by when they joined
    callback(list);
  });
}

/**
 * Save (or overwrite) this device's picks for a session.
 * @param {string} code
 * @param {string} name
 * @param {string[]} cuisineIds  slugs like "thai", "middle-eastern"
 */
export function submitPicks(code, name, cuisineIds) {
  const cuisines = Object.fromEntries(cuisineIds.map((id) => [id, true]));
  return set(ref(db, `sessions/${code}/participants/${uid}`), {
    name,
    cuisines,
    updatedAt: serverTimestamp(),
  });
}
