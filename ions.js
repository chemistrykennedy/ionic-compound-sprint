// Ion data — EXACTLY the cations and anions from the reference sheet, nothing else.
//   c / a = charge magnitude
//   poly  = polyatomic (needs parentheses when subscripted)
//   r     = familiarity tier 0..3 (0 = very common, 3 = save for the end)
//   late  = always placed in the final questions (ammonium, hypochlorite, nitrite,
//           monohydrogenphosphate, citrate — the hardest-to-recall ions)
//   cap   = an "unusual" anion (kept among the difficult group)

const CATIONS = [
  { name: "ammonium", f: "NH4", c: 1, poly: true, r: 3, late: true },
  { name: "copper(I)", f: "Cu", c: 1, r: 2 },
  { name: "hydronium", f: "H3O", c: 1, poly: true, r: 3 },
  { name: "lithium", f: "Li", c: 1, r: 0 },
  { name: "potassium", f: "K", c: 1, r: 0 },
  { name: "silver", f: "Ag", c: 1, r: 1 },
  { name: "sodium", f: "Na", c: 1, r: 0 },
  { name: "barium", f: "Ba", c: 2, r: 0 },
  { name: "calcium", f: "Ca", c: 2, r: 0 },
  { name: "copper(II)", f: "Cu", c: 2, r: 1 },
  { name: "iron(II)", f: "Fe", c: 2, r: 1 },
  { name: "lead(II)", f: "Pb", c: 2, r: 2 },
  { name: "magnesium", f: "Mg", c: 2, r: 0 },
  { name: "mercury(II)", f: "Hg", c: 2, r: 2 },
  { name: "nickel(II)", f: "Ni", c: 2, r: 1 },
  { name: "tin(II)", f: "Sn", c: 2, r: 2 },
  { name: "zinc", f: "Zn", c: 2, r: 1 },
  { name: "aluminium", f: "Al", c: 3, r: 1 },
  { name: "chromium(III)", f: "Cr", c: 3, r: 2 },
  { name: "iron(III)", f: "Fe", c: 3, r: 1 },
  { name: "titanium(IV)", f: "Ti", c: 4, r: 3 },
];

const ANIONS = [
  // 1-
  { name: "bromide", f: "Br", a: 1, r: 0 },
  { name: "chlorate", f: "ClO3", a: 1, poly: true, r: 1, cap: true },
  { name: "chloride", f: "Cl", a: 1, r: 0 },
  { name: "chlorite", f: "ClO2", a: 1, poly: true, r: 2 },
  { name: "cyanide", f: "CN", a: 1, poly: true, r: 1 },
  { name: "dihydrogenphosphate", f: "H2PO4", a: 1, poly: true, r: 3 },
  { name: "ethanoate", f: "CH3COO", a: 1, poly: true, r: 1 },
  { name: "fluoride", f: "F", a: 1, r: 0 },
  { name: "hydrogencarbonate", f: "HCO3", a: 1, poly: true, r: 1 },
  { name: "hydrogensulfate", f: "HSO4", a: 1, poly: true, r: 2 },
  { name: "hydrogensulfide", f: "HS", a: 1, poly: true, r: 2 },
  { name: "hydrogensulfite", f: "HSO3", a: 1, poly: true, r: 2, cap: true },
  { name: "hydroxide", f: "OH", a: 1, poly: true, r: 0 },
  { name: "hypochlorite", f: "ClO", a: 1, poly: true, r: 3, late: true, cap: true },
  { name: "iodide", f: "I", a: 1, r: 0 },
  { name: "nitrate", f: "NO3", a: 1, poly: true, r: 0 },
  { name: "nitrite", f: "NO2", a: 1, poly: true, r: 3, late: true },
  { name: "perchlorate", f: "ClO4", a: 1, poly: true, r: 2 },
  { name: "permanganate", f: "MnO4", a: 1, poly: true, r: 1 },
  // 2-
  { name: "carbonate", f: "CO3", a: 2, poly: true, r: 0 },
  { name: "chromate", f: "CrO4", a: 2, poly: true, r: 1 },
  { name: "dichromate", f: "Cr2O7", a: 2, poly: true, r: 2 },
  { name: "monohydrogenphosphate", f: "HPO4", a: 2, poly: true, r: 3, late: true },
  { name: "oxide", f: "O", a: 2, r: 0 },
  { name: "peroxide", f: "O2", a: 2, poly: true, r: 2, cap: true },
  { name: "sulfate", f: "SO4", a: 2, poly: true, r: 0 },
  { name: "sulfide", f: "S", a: 2, r: 0 },
  { name: "sulfite", f: "SO3", a: 2, poly: true, r: 1 },
  { name: "thiosulfate", f: "S2O3", a: 2, poly: true, r: 2, cap: true },
  // 3-
  { name: "citrate", f: "C6H5O7", a: 3, poly: true, r: 3, late: true }, // hard to recall -> end
  { name: "nitride", f: "N", a: 3, r: 1 },
  { name: "phosphate", f: "PO4", a: 3, poly: true, r: 0 },
];

function gcd(x, y) { return y === 0 ? x : gcd(y, x % y); }

// Neutral compound formula for a cation/anion pair (criss-cross + simplify).
function buildFormula(cat, an) {
  const g = gcd(cat.c, an.a);
  return ionPart(cat, an.a / g) + ionPart(an, cat.c / g);
}
function ionPart(ion, n) {
  if (n === 1) return ion.f;
  return ion.poly ? `(${ion.f})${n}` : `${ion.f}${n}`;
}

// ---- Chemical existence filter -------------------------------------------------
// Remove compounds that don't exist / are unstable as simple ionic salts. These are
// conservative, defensible rules — not an exhaustive solubility/redox table.
function valid(cat, an) {
  const c = cat.name, a = an.name;

  // Hydronium forms no stable, isolable named ionic salt.
  if (c === "hydronium") return false;

  // Ammonium: oxide/hydroxide/nitride/peroxide don't exist.
  if (c === "ammonium" && ["oxide", "hydroxide", "nitride", "peroxide"].includes(a)) return false;

  // Hydroxides that decompose straight to the oxide.
  if (a === "hydroxide" && ["silver", "copper(I)", "mercury(II)"].includes(c)) return false;

  // Ionic peroxides exist only for group 1 & 2 metals.
  if (a === "peroxide" &&
      !["lithium", "sodium", "potassium", "magnesium", "calcium", "barium"].includes(c)) return false;

  // Clean ionic nitrides only for strongly electropositive metals.
  if (a === "nitride" &&
      !["lithium", "magnesium", "calcium", "barium", "aluminium", "zinc"].includes(c)) return false;

  // "Acid salts" — stable solids essentially only with group 1 + ammonium.
  if (["hydrogencarbonate", "hydrogensulfite", "hydrogensulfate", "hydrogensulfide"].includes(a) &&
      !["lithium", "sodium", "potassium", "ammonium"].includes(c)) return false;

  // Di-/mono-hydrogenphosphate: group 1, group 2, ammonium.
  if (["dihydrogenphosphate", "monohydrogenphosphate"].includes(a) &&
      !["lithium", "sodium", "potassium", "magnesium", "calcium", "barium", "ammonium"].includes(c)) return false;

  // Carbonates & sulfites of 3+/4+ cations hydrolyse — they don't exist as simple salts.
  if (["carbonate", "sulfite"].includes(a) && cat.c >= 3) return false;

  // Copper(I) is only stable as a few insoluble salts.
  if (c === "copper(I)" && !["chloride", "bromide", "iodide", "oxide", "sulfide", "cyanide"].includes(a)) return false;

  // Oxidising cation + iodide -> redox, no stable salt.
  if (a === "iodide" && ["copper(II)", "iron(III)"].includes(c)) return false;

  return true;
}

// Structural complexity (how fiddly the formula is to write).
function structural(cat, an) {
  const g = gcd(cat.c, an.a);
  const catSub = an.a / g, anSub = cat.c / g;
  const parens = (cat.poly && catSub > 1) || (an.poly && anSub > 1);
  let s = 0;
  s += (cat.c - 1) * 1.2 + (an.a - 1) * 1.2;
  s += (cat.poly ? 1 : 0) + (an.poly ? 1 : 0);
  s += parens ? 3 : 0;
  s += (catSub > 1 ? 1 : 0) + (anSub > 1 ? 1 : 0);
  s += (catSub + anSub) * 0.25;
  return s;
}

// `late` ions get a big offset so they sort to the very end. Otherwise familiarity
// tier dominates and structural complexity orders within a tier.
function difficulty(cat, an) {
  const lateCount = (cat.late ? 1 : 0) + (an.late ? 1 : 0);
  return lateCount * 1000 + (cat.r + an.r) * 20 + structural(cat, an);
}

// Anions that may ONLY appear in the final difficult quarter of a quiz.
const DIFFICULT_ANIONS = new Set([
  "dihydrogenphosphate", "hydrogensulfide", "hydrogensulfite", "hypochlorite",
  "nitrite", "perchlorate", "chromate", "monohydrogenphosphate", "peroxide",
  "sulfite", "thiosulfate", "citrate",
]);

// A compound is "difficult" if it uses an uncommon ion / unusual anion / late ion.
function isHard(cat, an) {
  return !!cat.late || !!an.late || !!an.cap || DIFFICULT_ANIONS.has(an.name) || cat.r >= 2 || an.r >= 2;
}
// "Very easy" = a common group 1/2 metal with a common monatomic anion (e.g. NaCl, MgCl2).
function isVeryEasy(cat, an) {
  return cat.r === 0 && an.r === 0 && !an.poly && !cat.poly;
}

function allCombos() {
  const out = [];
  for (const cat of CATIONS) {
    for (const an of ANIONS) {
      if (!valid(cat, an)) continue;
      out.push({
        name: `${cat.name} ${an.name}`,
        answer: buildFormula(cat, an),
        score: difficulty(cat, an),
        hard: isHard(cat, an),
        veryEasy: isVeryEasy(cat, an),
      });
    }
  }
  return out;
}

// Build a quiz of `count` distinct compounds:
//   * Q1 is always a very easy compound.
//   * difficulty rises; the easy/medium compounds fill the first 3/4.
//   * at most a quarter of questions are "difficult", and they sit at the very end.
function buildQuiz(count = 16) {
  const byScore = (p, q) => p.score - q.score || p.name.localeCompare(q.name);
  const all = allCombos();
  const easy = all.filter((c) => !c.hard).sort(byScore);
  const hard = all.filter((c) => c.hard).sort(byScore);
  const veryEasy = easy.filter((c) => c.veryEasy);

  const nHard = Math.min(Math.floor(count / 4), hard.length); // <= one quarter
  const nEasy = count - nHard;

  const used = new Set();
  const chosen = [];

  // Pick one random unused compound from each of `n` ascending difficulty bins.
  const takeBins = (pool, n) => {
    const m = pool.length;
    for (let i = 0; i < n; i++) {
      const s = Math.floor((i * m) / n);
      const e = Math.max(s + 1, Math.floor(((i + 1) * m) / n));
      let pick = null;
      for (let t = 0; t < 16; t++) {
        const cand = pool[s + Math.floor(Math.random() * (e - s))];
        if (cand && !used.has(cand.answer)) { pick = cand; break; }
      }
      if (!pick) pick = pool.slice(s, e).find((c) => !used.has(c.answer)) || pool.find((c) => !used.has(c.answer));
      if (pick) { used.add(pick.answer); chosen.push(pick); }
    }
  };

  // Q1: very easy.
  if (veryEasy.length) {
    const q1 = veryEasy[Math.floor(Math.random() * veryEasy.length)];
    used.add(q1.answer);
    chosen.push(q1);
    takeBins(easy, nEasy - 1);
  } else {
    takeBins(easy, nEasy);
  }
  // Difficult quarter, at the very end (hardest / citrate last).
  takeBins(hard, nHard);

  return chosen;
}
