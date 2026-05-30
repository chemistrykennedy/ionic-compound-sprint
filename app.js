"use strict";

const $ = (id) => document.getElementById(id);
const HISTORY_KEY = "ifq-history";

const state = {
  name: "",
  count: Number(localStorage.getItem("ifq-count")) || 16, // 8 or 16 questions
  quiz: [],          // chosen compounds
  inputs: [],        // input elements
  correct: 0,
  startTime: 0,
  rafId: null,
  running: false,
  sessionTimes: [],  // completion ms this session (for "best this session")
  audio: null,
};

/* ---------- Theme: auto light/dark by local time + location ---------- */
let manualOverride = false;

function setTheme(t) {
  document.body.dataset.theme = t;
  updateThemeIcon();
}
function updateThemeIcon() {
  const dark = document.body.dataset.theme === "dark";
  $("themeToggle").textContent = dark ? "☀️" : "🌙";
  $("themeToggle").title = dark ? "Dark (auto) — tap for light" : "Light (auto) — tap for dark";
}

// Sunrise equation (NOAA approximation). Returns Date objects in local time,
// or {polar:'day'|'night'} when the sun doesn't rise/set.
function sunTimes(date, lat, lng) {
  const rad = Math.PI / 180, DAY = 86400000;
  const J = date.getTime() / DAY + 2440587.5;       // Julian day
  const lw = -lng;
  const n = Math.round(J - 2451545.0 - 0.0009 - lw / 360);
  const Jstar = 2451545.0 + 0.0009 + lw / 360 + n;  // mean solar noon
  const M = (357.5291 + 0.98560028 * (Jstar - 2451545.0)) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const Jtransit = Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const delta = Math.asin(Math.sin(lambda * rad) * Math.sin(23.44 * rad)) / rad;
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(delta * rad)) /
               (Math.cos(lat * rad) * Math.cos(delta * rad));
  if (cosH > 1) return { polar: "night" };
  if (cosH < -1) return { polar: "day" };
  const H = Math.acos(cosH) / rad;
  const toDate = (j) => new Date((j - 2440587.5) * DAY);
  return { sunrise: toDate(Jtransit - H / 360), sunset: toDate(Jtransit + H / 360) };
}

function hourHeuristic() {
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? "light" : "dark";
}

function applyAutoTheme() {
  if (manualOverride) return;
  setTheme(hourHeuristic()); // instant, no-flash fallback
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (manualOverride) return;
      const now = new Date();
      const t = sunTimes(now, pos.coords.latitude, pos.coords.longitude);
      let theme;
      if (t.polar === "day") theme = "light";
      else if (t.polar === "night") theme = "dark";
      else theme = now >= t.sunrise && now <= t.sunset ? "light" : "dark";
      setTheme(theme);
    },
    () => {/* permission denied -> keep hour-based fallback */},
    { timeout: 8000, maximumAge: 3600000 }
  );
}

// Manual tap overrides for this session only (reload returns to auto).
$("themeToggle").addEventListener("click", () => {
  manualOverride = true;
  setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
});

applyAutoTheme();

/* ---------- Time formatting ---------- */
function fmt(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const h = Math.floor((ms % 1000) / 10);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(m)}:${p(s)}.${p(h)}`;
}

/* ---------- History (persisted last runs + session best) ---------- */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-20)));
}
// All-time best for the full 16-question challenge (persists across sessions).
const BEST16_KEY = "ifq-best16";
function bestAllTime16() {
  const v = Number(localStorage.getItem(BEST16_KEY));
  return v > 0 ? v : null;
}
function recordBest16(ms) {
  const cur = bestAllTime16();
  if (cur == null || ms < cur) localStorage.setItem(BEST16_KEY, String(ms));
}

function renderHistory() {
  const runs = loadHistory().filter((r) => r.count === 16); // full challenge only
  const best = bestAllTime16();
  const list = runs.slice(-5).reverse();
  const ol = $("historyList");
  ol.innerHTML = "";
  if (!list.length) {
    ol.innerHTML = '<li class="empty">No full runs yet</li>';
  } else {
    for (const r of list) {
      const li = document.createElement("li");
      const isBest = best != null && r.ms === best;
      if (isBest) {
        li.className = "best-row";
        li.innerHTML =
          `<span class="who">⭐ ${escapeHtml(r.name || "—")}</span>` +
          `<span class="best-time">${fmt(r.ms)} ⭐</span>`;
      } else {
        li.innerHTML = `<span class="who">${escapeHtml(r.name || "—")}</span><span>${fmt(r.ms)}</span>`;
      }
      ol.appendChild(li);
    }
  }
  $("bestTime").textContent = best == null ? "Best: —" : `Best: ${fmt(best)}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ---------- Global leaderboard (reads the Google Form's response Sheet) ---------- */
const SHEET_ID = "1tWukcncyfKDJcxADWsQHKF6TnXSAc9GVpxI6mpLrUfw";
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
const LEADER_COUNT = 5;       // top N people
const LEADER_CHALLENGE = 16;  // only the full 16-question challenge counts

function parseTimeToMs(str) {
  if (str == null) return Infinity;
  const parts = String(str).trim().split(":");
  if (parts.length === 3) return (+parts[0]) * 3600000 + (+parts[1]) * 60000 + parseFloat(parts[2]) * 1000;
  if (parts.length === 2) return (+parts[0]) * 60000 + parseFloat(parts[1]) * 1000;
  return Infinity;
}

// Display as "First L." (first name + last initial).
function leaderName(raw) {
  const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

async function loadLeaderboard() {
  const box = $("leaderList");
  if (!box) return;
  box.innerHTML = '<li class="lb-empty">Loading…</li>';
  try {
    const res = await fetch(GVIZ_URL, { cache: "no-store" });
    const text = await res.text();
    const json = JSON.parse(text.substring(text.indexOf("(") + 1, text.lastIndexOf(")")));
    const cols = json.table.cols.map((c) => (c.label || "").toLowerCase());
    const iName = cols.indexOf("name"), iQ = cols.indexOf("questions"), iTime = cols.indexOf("time");

    const best = new Map(); // one entry per student: normalised name -> { name, ms }
    for (const row of json.table.rows || []) {
      const c = row.c; if (!c) continue;
      if (Number(c[iQ] && c[iQ].v) !== LEADER_CHALLENGE) continue;
      const rawName = c[iName] && c[iName].v;
      const ms = parseTimeToMs(c[iTime] && c[iTime].v);
      if (!rawName || !isFinite(ms)) continue;
      const key = String(rawName).trim().toLowerCase();
      const cur = best.get(key);
      if (!cur || ms < cur.ms) best.set(key, { name: rawName, ms });
    }
    const top = [...best.values()].sort((a, b) => a.ms - b.ms).slice(0, LEADER_COUNT);
    renderLeaderboard(top);
  } catch (e) {
    box.innerHTML = '<li class="lb-empty">Couldn’t load leaderboard</li>';
  }
}

function renderLeaderboard(top) {
  const box = $("leaderList");
  if (!box) return;
  box.innerHTML = "";
  if (!top.length) {
    box.innerHTML = '<li class="lb-empty">No full-challenge times yet — be the first!</li>';
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  top.forEach((e, i) => {
    const li = document.createElement("li");
    if (i < 3) li.classList.add("podium");
    li.innerHTML =
      `<span class="lb-rank">${medals[i] || i + 1}</span>` +
      `<span class="lb-name">${escapeHtml(leaderName(e.name))}</span>` +
      `<span class="lb-time">${fmt(e.ms)}</span>`;
    box.appendChild(li);
  });
}

/* ---------- Audio: tense, rising-pitch reward ---------- */
function ensureAudio() {
  if (!state.audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) state.audio = new AC();
  }
  if (state.audio && state.audio.state === "suspended") state.audio.resume();
}
// Play one rising "ping" — pitch climbs with each correct answer (step 1..16).
function playCorrect(step) {
  const ctx = state.audio;
  if (!ctx) return;
  const t = ctx.currentTime;
  // CHROMATIC rise: +1 semitone per correct answer. A relentless half-step climb
  // is the classic "horror riser" — it never resolves, so tension keeps mounting.
  const dur = 0.5;
  const base = 155.56; // E♭3, dark starting point
  const freq = base * Math.pow(2, (step - 1) / 12);

  // Master envelope + resonant lowpass that opens as the pitch climbs (more intense).
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  master.connect(ctx.destination);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(650 + step * 160, t);
  lp.Q.value = 6; // resonant => eerie, whistling edge
  lp.connect(master);

  // Tremolo: a wavering amplitude that sounds unsettled.
  const trem = ctx.createGain();
  trem.gain.value = 1;
  trem.connect(lp);
  const tremLfo = ctx.createOscillator();
  tremLfo.frequency.value = 7;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0.3;
  tremLfo.connect(tremDepth); tremDepth.connect(trem.gain);
  tremLfo.start(t); tremLfo.stop(t + dur);

  // Vibrato: slow pitch wobble shared by the main voices (creepy instability).
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.5;
  const vibDepth = ctx.createGain();
  vibDepth.gain.value = freq * 0.008;
  vib.connect(vibDepth);
  vib.start(t); vib.stop(t + dur);

  // Voices: two detuned saws (beating = unease) + a TRITONE above (the "evil" interval).
  const voices = [
    { f: freq, type: "sawtooth", detune: 9, g: 0.55 },
    { f: freq, type: "sawtooth", detune: -9, g: 0.55 },
    { f: freq * Math.pow(2, 6 / 12), type: "triangle", detune: 0, g: 0.2 },
  ];
  voices.forEach((v) => {
    const osc = ctx.createOscillator();
    osc.type = v.type;
    osc.frequency.value = v.f;
    osc.detune.value = v.detune;
    vibDepth.connect(osc.frequency);
    const og = ctx.createGain();
    og.gain.value = v.g;
    osc.connect(og); og.connect(trem);
    osc.start(t); osc.stop(t + dur);
  });

  // Low sub-drone on the fixed tonic — the climbing melody pulls away from it,
  // so the dissonance grows as the quiz progresses.
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = base / 2;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  sub.connect(sg); sg.connect(ctx.destination);
  sub.start(t); sub.stop(t + dur);
}
// Finish: a dark, cinematic sting that lands on a minor chord (with a low boom).
function playFinish() {
  const ctx = state.audio;
  if (!ctx) return;
  const t = ctx.currentTime;
  const dur = 1.7;

  // Filter sweep open for a dramatic "reveal".
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(450, t);
  lp.frequency.exponentialRampToValueAtTime(4000, t + 0.6);
  lp.Q.value = 3;
  lp.connect(ctx.destination);

  // Tremolo shimmer over the whole chord.
  const trem = ctx.createGain();
  trem.gain.value = 1;
  trem.connect(lp);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 8;
  const depth = ctx.createGain();
  depth.gain.value = 0.28;
  lfo.connect(depth); depth.connect(trem.gain);
  lfo.start(t); lfo.stop(t + dur);

  const chord = [220, 261.63, 329.63, 440, 880]; // A minor, spread
  chord.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    osc.detune.value = (i - 2) * 6; // slight detune for richness/unease
    const g = ctx.createGain();
    const start = t + i * 0.06;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.16, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
    osc.connect(g); g.connect(trem);
    osc.start(start); osc.stop(start + 1.45);
  });

  // Low boom underneath.
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 55;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.3, t + 0.04);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  sub.connect(sg); sg.connect(ctx.destination);
  sub.start(t); sub.stop(t + 1.5);
}

/* ---------- Log results to Google Form ---------- */
const FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSf3D96p4fXdoDMX69b0746h9TtItaZ3rX-f3NBmfL0hMQi88w/formResponse";
const FORM_FIELDS = { name: "entry.1227311104", count: "entry.952235621", time: "entry.1017530340" };

function logResult(name, count, timeStr) {
  const status = $("saveStatus");
  if (status) { status.textContent = "Saving result…"; status.className = "save-status"; }
  const body = new URLSearchParams();
  body.set(FORM_FIELDS.name, name);
  body.set(FORM_FIELDS.count, String(count));
  body.set(FORM_FIELDS.time, timeStr);
  // Google Forms blocks reading the response (CORS), so fire-and-forget with no-cors.
  fetch(FORM_ACTION, { method: "POST", mode: "no-cors", body })
    .then(() => { if (status) { status.textContent = "✓ Result saved"; status.classList.add("ok"); } })
    .catch(() => { if (status) { status.textContent = "⚠ Couldn’t save (no connection)"; status.classList.add("warn"); } });
}

/* ---------- Timer ---------- */
function tick() {
  if (!state.running) return;
  $("timer").textContent = fmt(performance.now() - state.startTime);
  state.rafId = requestAnimationFrame(tick);
}

/* ---------- Build quiz UI ---------- */
function renderGrid() {
  const grid = $("grid");
  grid.innerHTML = "";
  state.inputs = [];
  state.quiz.forEach((q, i) => {
    const cell = document.createElement("div");
    cell.className = "qcell";
    cell.innerHTML = `
      <div class="qnum">${i + 1}</div>
      <div class="qname">${escapeHtml(q.name)}</div>
      <input class="qinput" type="text" spellcheck="false" autocomplete="off"
             autocapitalize="none" autocorrect="off" aria-label="${escapeHtml(q.name)}" />
      <span class="qmark"></span>`;
    const input = cell.querySelector(".qinput");
    input.addEventListener("input", () => checkCell(i));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); focusNext(i); }
    });
    state.inputs.push(input);
    grid.appendChild(cell);
  });
}

function checkCell(i) {
  const input = state.inputs[i];
  const cell = input.closest(".qcell");
  if (cell.classList.contains("correct")) return;
  // Ignore trailing spaces; case-insensitive (numbers & parentheses still required).
  const val = input.value.replace(/\s+$/, "");
  if (val.toLowerCase() === state.quiz[i].answer.toLowerCase()) {
    cell.classList.add("correct");
    input.value = val;
    input.readOnly = true;
    cell.querySelector(".qmark").textContent = "✓";
    state.correct += 1;
    const total = state.quiz.length;
    $("progressBar").style.width = (state.correct / total) * 100 + "%";
    playCorrect(state.correct);
    if (state.correct === total) finish();
    else focusNext(i);
  }
}

function focusNext(i) {
  const total = state.quiz.length;
  for (let k = 1; k <= total; k++) {
    const j = (i + k) % total;
    const inp = state.inputs[j];
    if (inp && !inp.readOnly) { inp.focus(); inp.select(); return; }
  }
}

/* ---------- Flow ---------- */
function startQuiz() {
  state.name = $("nameInput").value.trim() || "Chemist";
  state.quiz = buildQuiz(state.count);
  state.correct = 0;
  ensureAudio();

  $("playerName").textContent = state.name;
  $("progressBar").style.width = "0%";
  renderGrid();

  $("startScreen").classList.add("hidden");
  $("quizScreen").classList.remove("hidden");

  state.startTime = performance.now();
  state.running = true;
  tick();
  if (state.inputs[0]) state.inputs[0].focus();
}

function finish() {
  state.running = false;
  cancelAnimationFrame(state.rafId);
  const ms = performance.now() - state.startTime;
  $("timer").textContent = fmt(ms);

  const prevBest = state.sessionTimes.length ? Math.min(...state.sessionTimes) : Infinity;
  const isBest = ms < prevBest;
  state.sessionTimes.push(ms);

  const hist = loadHistory();
  hist.push({ name: state.name, ms, count: state.quiz.length, ts: Date.now() });
  saveHistory(hist);
  if (state.quiz.length === 16) recordBest16(ms); // all-time best for the full challenge

  playFinish();
  burstStars();

  const n = state.quiz.length;
  $("resultBadge").innerHTML = `<span class="count-btn is-badge" data-count="${n}">${n}</span>`;
  $("resultTitle").textContent = `${state.name}, congratulations!`;
  $("resultTime").textContent = fmt(ms);
  logResult(state.name, n, fmt(ms)); // send to the Google Form
  const best = Math.min(...state.sessionTimes);
  $("resultMeta").innerHTML =
    (isBest ? '<div class="new-best">⭐ New session best!</div>' : "") +
    `Best this session: ${fmt(best)}`;
  setTimeout(() => $("resultOverlay").classList.remove("hidden"), 650);
}

function burstStars() {
  const layer = $("stars");
  layer.innerHTML = "";
  const glyphs = ["⭐", "🌟", "✨"];
  for (let i = 0; i < 40; i++) {
    const s = document.createElement("span");
    s.className = "star";
    s.textContent = glyphs[i % glyphs.length];
    s.style.left = Math.random() * 100 + "vw";
    s.style.fontSize = 0.9 + Math.random() * 1.6 + "rem";
    s.style.animationDuration = 2.2 + Math.random() * 2.2 + "s";
    s.style.animationDelay = Math.random() * 0.8 + "s";
    layer.appendChild(s);
  }
  setTimeout(() => { layer.innerHTML = ""; }, 5500);
}

function reset() {
  $("resultOverlay").classList.add("hidden");
  $("stars").innerHTML = "";
  $("quizScreen").classList.add("hidden");
  $("startScreen").classList.remove("hidden");
  $("timer").textContent = "00:00.00";
  renderHistory();
  loadLeaderboard();
  $("nameInput").focus();
  $("nameInput").select();
}

/* ---------- Question-count chooser (tapping a number starts the quiz) ---------- */
function startWithCount(c) {
  state.count = c;
  localStorage.setItem("ifq-count", String(c));
  startQuiz();
}
document.querySelectorAll(".count-btn").forEach((b) =>
  b.addEventListener("click", () => startWithCount(Number(b.dataset.count)))
);

/* ---------- Wire up ---------- */
// Enter in the name field starts with the last-used count.
$("startForm").addEventListener("submit", (e) => { e.preventDefault(); startWithCount(state.count || 16); });
$("againBtn").addEventListener("click", reset);
renderHistory();
loadLeaderboard();
$("nameInput").focus();
