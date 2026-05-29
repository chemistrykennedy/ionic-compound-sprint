"use strict";

const $ = (id) => document.getElementById(id);
const HISTORY_KEY = "ifq-history";

const state = {
  name: "",
  quiz: [],          // 16 chosen compounds
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
function renderHistory() {
  const list = loadHistory().slice(-5).reverse();
  const ol = $("historyList");
  ol.innerHTML = "";
  if (!list.length) {
    ol.innerHTML = '<li class="empty">No runs yet</li>';
  } else {
    for (const r of list) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="who">${escapeHtml(r.name || "—")}</span><span>${fmt(r.ms)}</span>`;
      ol.appendChild(li);
    }
  }
  const best = state.sessionTimes.length ? Math.min(...state.sessionTimes) : null;
  $("bestTime").textContent = best == null ? "Best: —" : `Best: ${fmt(best)}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
  // Rising A HARMONIC MINOR scale -> climbs in pitch with each correct answer.
  // Harmonic minor (raised 7th, the +3-semitone leap) keeps it minor and tense.
  const MINOR = [0, 2, 3, 5, 7, 8, 11]; // scale degrees in semitones from the tonic
  const i = Math.max(0, step - 1);
  const semi = MINOR[i % 7] + 12 * Math.floor(i / 7);
  const base = 220; // A3
  const freq = base * Math.pow(2, semi / 12);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.18, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1100 + step * 130, t);
  gain.connect(ctx.destination);
  filter.connect(gain);

  // main note + a minor-third above for a tense colour
  [[freq, "sawtooth", 1], [freq * Math.pow(2, 3 / 12), "triangle", 0.5]].forEach(([f, type, g]) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    const og = ctx.createGain();
    og.gain.value = g;
    osc.connect(og); og.connect(filter);
    osc.start(t); osc.stop(t + 0.36);
  });
}
// Triumphant finish chord.
function playFinish() {
  const ctx = state.audio;
  if (!ctx) return;
  const t = ctx.currentTime;
  const chord = [440, 523.25, 659.25, 880]; // A minor (A C E A) — minor resolution
  chord.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    const start = t + i * 0.07;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(start); osc.stop(start + 1.2);
  });
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
    $("progressBar").style.width = (state.correct / 16) * 100 + "%";
    playCorrect(state.correct);
    if (state.correct === 16) finish();
    else focusNext(i);
  }
}

function focusNext(i) {
  for (let k = 1; k <= 16; k++) {
    const j = (i + k) % 16;
    const inp = state.inputs[j];
    if (inp && !inp.readOnly) { inp.focus(); inp.select(); return; }
  }
}

/* ---------- Flow ---------- */
function startQuiz(e) {
  e.preventDefault();
  state.name = $("nameInput").value.trim() || "Chemist";
  state.quiz = buildQuiz();
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
  hist.push({ name: state.name, ms, ts: Date.now() });
  saveHistory(hist);

  playFinish();
  burstStars();

  $("resultTitle").textContent = `${state.name}, nailed it!`;
  $("resultTime").textContent = fmt(ms);
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
  $("nameInput").focus();
  $("nameInput").select();
}

/* ---------- Wire up ---------- */
$("startForm").addEventListener("submit", startQuiz);
$("againBtn").addEventListener("click", reset);
renderHistory();
$("nameInput").focus();
