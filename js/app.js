// =========================================================
// app.js: UI logic. Wires the screens in index.html to the
// backend (backend.js) and the ranking logic (scoring.js).
//
// Screens:  loading → home → picks ⇄ results
// The current session code lives in the URL (?s=ABCDE), so the
// share link is just the page URL.
// =========================================================

import * as backend from "./backend.js";
import { cuisinesFromRestaurants, tallyCuisines, rankRestaurants } from "./scoring.js";
import { MAX_RESULTS } from "./config.js";

// Emoji shown on each cuisine button. Keys are cuisine IDs
// (lowercase, spaces → dashes). Cuisines not listed get 🍽️.
const CUISINE_EMOJI = {
  american: "🍔", bbq: "🍖", burgers: "🍔", chinese: "🥡", italian: "🍝",
  hibachi: "🍤", mexican: "🌮", pizza: "🍕", mediterranean: "🫒", greek: "🥙",
};

// ---------- App state ----------
const state = {
  restaurants: [],     // from data/restaurants.json
  cuisines: [],        // [{id, name}] derived from restaurants
  solo: false,         // true in "Just me" mode (no session, no Firebase)
  online: false,       // true once Firebase connected (needed for group sessions)
  code: null,          // current session code
  myId: null,          // this device's Firebase user ID
  participants: [],    // live list from Firebase
  selected: new Set(), // cuisine IDs this person has tapped
  hasSubmitted: false,
  dirty: false,        // true once the user changes picks locally
  unwatch: null,       // stops the Firebase listener
};

// ---------- Tiny DOM helpers ----------
const $ = (id) => document.getElementById(id);

function show(screenId) {
  for (const el of document.querySelectorAll(".screen")) el.hidden = el.id !== screenId;
  window.scrollTo(0, 0);
}

/** Create an element with optional class and text (text is never parsed as HTML). */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2000);
}

function showError(id, msg) {
  $(id).textContent = msg;
  $(id).hidden = !msg;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function cuisineName(id) {
  return state.cuisines.find((c) => c.id === id)?.name ?? id;
}

// ---------- Startup ----------
async function init() {
  // Connect to Firebase in parallel with loading the restaurant list.
  // Firebase is only needed for group sessions. If it fails, "Just me" still works.
  const connecting = backend.isConfigured()
    ? backend.connect().then((id) => { state.myId = id; state.online = true; })
        .catch((err) => console.error("Firebase connection failed:", err))
    : Promise.resolve();

  try {
    const data = await fetch("data/restaurants.json", { cache: "no-cache" }).then((r) => r.json());
    state.restaurants = data.restaurants;
    state.cuisines = cuisinesFromRestaurants(state.restaurants);
  } catch (err) {
    console.error(err);
    $("loading-msg").textContent = "Couldn't load the restaurant list. Check your connection and refresh.";
    return;
  }
  await connecting;

  $("input-name").value = localStorage.getItem("dinnertime:name") || "";
  renderCuisineGrid();
  bindEvents();

  if (!state.online) {
    // Group features need Firebase; leave "Just me" available.
    $("btn-create").disabled = true;
    $("form-join").querySelector("button").disabled = true;
    showError("home-error", "Group sessions are unavailable right now. You can still use \"Just me\".");
    show("screen-home");
    return;
  }

  // Opened from a share link? Jump straight into that session.
  const code = backend.normalizeCode(new URLSearchParams(location.search).get("s"));
  if (code) {
    await joinSession(code);
  } else {
    show("screen-home");
  }
}

/** Toggle between "Just me" and group mode (CSS hides the irrelevant parts). */
function setSolo(on) {
  state.solo = on;
  document.querySelector(".app").classList.toggle("solo", on);
  updateSubmitButton();
}

function bindEvents() {
  $("btn-create").addEventListener("click", onCreate);
  $("btn-solo").addEventListener("click", startSolo);
  $("btn-home").addEventListener("click", goHome);
  $("form-join").addEventListener("submit", (e) => {
    e.preventDefault();
    joinSession(backend.normalizeCode($("input-code").value));
  });
  $("btn-share").addEventListener("click", openInvite);
  $("invite-close").addEventListener("click", closeInvite);
  $("invite-copy").addEventListener("click", copyInviteLink);
  $("invite-native").addEventListener("click", nativeShare);
  // Tapping the dimmed background also closes the sheet.
  $("invite").addEventListener("click", (e) => { if (e.target.id === "invite") closeInvite(); });
  $("btn-submit").addEventListener("click", onSubmit);
  $("btn-to-results").addEventListener("click", () => { renderResults(); show("screen-results"); });
  $("btn-back").addEventListener("click", () => show("screen-picks"));
  $("input-name").addEventListener("input", () => { state.dirty = true; updateSubmitButton(); });
}

// ---------- Home ----------

/** "Just me": pick cuisines and see matches without creating a session. */
function startSolo() {
  state.unwatch?.();
  state.unwatch = null;
  state.code = null;
  state.participants = [];
  state.hasSubmitted = false;
  history.replaceState(null, "", location.pathname);
  setSolo(true);
  show("screen-picks");
}

function goHome() {
  setSolo(false);
  show("screen-home");
}

async function onCreate() {
  const btn = $("btn-create");
  btn.disabled = true;
  try {
    const code = await backend.createSession();
    await joinSession(code);
    openInvite(); // the creator almost always wants to invite people next
  } catch (err) {
    console.error(err);
    showError("home-error", "Couldn't create a session. Please try again.");
  } finally {
    btn.disabled = false;
  }
}

async function joinSession(code) {
  showError("home-error", "");
  if (code.length !== 5) {
    show("screen-home");
    showError("home-error", "Session codes are 5 characters.");
    return;
  }
  if (!(await backend.sessionExists(code))) {
    history.replaceState(null, "", location.pathname);
    show("screen-home");
    showError("home-error", `No session found with code ${code}.`);
    return;
  }

  state.code = code;
  state.hasSubmitted = false;
  setSolo(false);
  history.replaceState(null, "", `${location.pathname}?s=${code}`);
  $("picks-code").textContent = code;
  $("results-code").textContent = code;

  // Start listening for everyone's picks in real time.
  state.unwatch?.();
  state.unwatch = backend.watchParticipants(code, onParticipantsChanged);
  show("screen-picks");
}

// ---------- Live updates ----------
function onParticipantsChanged(participants) {
  state.participants = participants;

  // If this device already submitted earlier (e.g. page refresh), restore its picks.
  const mine = participants.find((p) => p.id === state.myId);
  state.hasSubmitted = Boolean(mine);
  if (mine && !state.dirty) {
    state.selected = new Set(mine.cuisines);
    $("input-name").value = mine.name;
    renderCuisineGrid();
  }

  const countText = `${plural(participants.length, "person has", "people have")} submitted`;
  $("picks-count").textContent = countText;
  $("results-count").textContent = countText;

  updateSubmitButton();
  if (!$("screen-results").hidden) renderResults();
}

// ---------- Picks screen ----------
function renderCuisineGrid() {
  const grid = $("cuisine-grid");
  grid.replaceChildren(
    ...state.cuisines.map((c) => {
      const btn = el("button", "cuisine");
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(state.selected.has(c.id)));
      btn.append(el("span", "emoji", CUISINE_EMOJI[c.id] || "🍽️"), el("span", null, c.name));
      btn.addEventListener("click", () => toggleCuisine(c.id, btn));
      return btn;
    }),
  );
  updateSubmitButton();
}

function toggleCuisine(id, btn) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  btn.setAttribute("aria-pressed", String(state.selected.has(id)));
  state.dirty = true;
  showError("picks-error", "");
  updateSubmitButton();
}

function updateSubmitButton() {
  const n = state.selected.size;
  const btn = $("btn-submit");
  const verb = state.solo ? "Find restaurants" : state.hasSubmitted ? "Update picks" : "Submit picks";
  btn.textContent = n ? `${verb} (${n})` : verb;
  // In group mode, hide the submit button after submitting until something changes.
  btn.hidden = !state.solo && state.hasSubmitted && !state.dirty;
  $("btn-to-results").hidden = state.participants.length === 0;
}

async function onSubmit() {
  if (state.selected.size === 0) return showError("picks-error", "Pick at least one cuisine.");

  // "Just me": nothing to save, so rank locally with a single participant.
  if (state.solo) {
    state.participants = [{ id: "me", name: "You", cuisines: [...state.selected] }];
    renderResults();
    show("screen-results");
    return;
  }

  const name = $("input-name").value.trim();
  if (!name) return showError("picks-error", "Add your name so the group knows who's in.");

  const btn = $("btn-submit");
  btn.disabled = true;
  try {
    localStorage.setItem("dinnertime:name", name);
    await backend.submitPicks(state.code, name, [...state.selected]);
    state.dirty = false;
    state.hasSubmitted = true;
    toast("Picks saved!");
    renderResults();
    show("screen-results");
  } catch (err) {
    console.error(err);
    showError("picks-error", "Couldn't save your picks. Check your connection and try again.");
  } finally {
    btn.disabled = false;
    updateSubmitButton();
  }
}

// ---------- Invite sheet (QR code, Messages, copy link) ----------

const sessionUrl = () => `${location.origin}${location.pathname}?s=${state.code}`;
const inviteText = () => `Help pick where we eat! Tap to join (code ${state.code}): ${sessionUrl()}`;

function openInvite() {
  const url = sessionUrl();
  $("invite-code").textContent = state.code;

  // Draw the QR code as an SVG (crisp at any size). `qrcode` comes from js/vendor/qrcode.min.js.
  if (window.qrcode) {
    const qr = window.qrcode(0, "M"); // 0 = pick size automatically, M = medium error correction
    qr.addData(url);
    qr.make();
    $("invite-qr").innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }

  // "sms:?&body=" opens the Messages app with the text filled in on both iPhone and Android.
  $("invite-sms").href = `sms:?&body=${encodeURIComponent(inviteText())}`;

  // The phone's built-in share sheet (WhatsApp, email, etc.), where supported.
  $("invite-native").hidden = !navigator.share;

  $("invite").hidden = false;
}

function closeInvite() {
  $("invite").hidden = true;
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(sessionUrl());
    toast("Link copied!");
  } catch {
    toast("Couldn't copy. Long-press the address bar instead.");
  }
}

async function nativeShare() {
  try {
    await navigator.share({ title: "Dinnertime", text: "Help pick where we eat!", url: sessionUrl() });
  } catch {
    // User closed the share sheet. Nothing to do.
  }
}

// ---------- Results screen ----------
function renderResults() {
  const people = state.participants;
  $("results-people").textContent = people.length ? `In: ${people.map((p) => p.name).join(", ")}` : "";
  $("results-empty").hidden = people.length > 0;

  // Cuisine tally with a bar showing share of the group.
  const tally = tallyCuisines(people).slice(0, 6);
  $("cuisine-tally").replaceChildren(
    ...tally.map(({ id, count }) => {
      const li = el("li");
      const bar = el("div", "bar");
      bar.style.width = `${(count / people.length) * 100}%`;
      li.append(
        bar,
        el("span", null, `${CUISINE_EMOJI[id] || "🍽️"} ${cuisineName(id)}`),
        el("span", "count", `${count}/${people.length}`),
      );
      return li;
    }),
  );

  // Ranked restaurant cards.
  const ranked = rankRestaurants(state.restaurants, people, MAX_RESULTS);
  $("restaurant-list").replaceChildren(...ranked.map((r, i) => restaurantCard(r, i, people.length)));
}

function restaurantCard({ restaurant: r, satisfied }, index, total) {
  const li = el("li", index === 0 ? "card top" : "card");

  const head = el("div", "card-head");
  const titles = el("div");
  titles.append(el("h3", null, r.name), el("p", "meta", r.cuisines.join(" · ")));
  head.append(el("div", "rank", String(index + 1)), titles);

  const sat = el("p", "satisfies",
    satisfied.length === total ? `✅ Works for everyone (${total})` : `Works for ${satisfied.length} of ${total}`);
  sat.append(el("small", null, satisfied.join(", ")));

  li.append(head);
  if (!state.solo) li.append(sat); // "works for 1 of 1" is noise when solo

  // Optional website / menu button
  if (r.link) {
    const links = el("div", "links");
    const site = el("a", null, "🔗 Website / menu");
    site.href = r.link;
    site.target = "_blank";
    site.rel = "noopener";
    links.append(site);
    li.append(links);
  }
  return li;
}

init();
