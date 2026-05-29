// Ion data — EXACTLY the cations and anions from the reference sheet, nothing else.
//   c / a = charge magnitude
//   poly  = polyatomic (needs parentheses when subscripted)
//   r     = familiarity tier 0..3 (0 = very common -> early, 3 = save for the end)
//
// Ordering policy (per teacher request):
//   * Group 1 (Li, Na, K) and Group 2 (Mg, Ca, Ba) cations are the easy cations (r=0).
//   * Common anions — the halides, oxide, sulfide, hydroxide, nitrate, sulfate,
//     carbonate, phosphate — are the easy anions (r=0).
//   * hypochlorite, nitrite, monohydrogenphosphate and ammonium are forced LAST (r=3).
//   Familiarity dominates the ordering; structural complexity only orders within a tier.

const CATIONS = [
  { name: "ammonium", f: "NH4", c: 1, poly: true, r: 3, late: true },   // forced to the end
  { name: "copper(I)", f: "Cu", c: 1, r: 2 },
  { name: "hydronium", f: "H3O", c: 1, poly: true, r: 3 },
  { name: "lithium", f: "Li", c: 1, r: 0 },                 // group 1
  { name: "potassium", f: "K", c: 1, r: 0 },                // group 1
  { name: "silver", f: "Ag", c: 1, r: 1 },
  { name: "sodium", f: "Na", c: 1, r: 0 },                  // group 1
  { name: "barium", f: "Ba", c: 2, r: 0 },                  // group 2
  { name: "calcium", f: "Ca", c: 2, r: 0 },                 // group 2
  { name: "copper(II)", f: "Cu", c: 2, r: 1 },
  { name: "iron(II)", f: "Fe", c: 2, r: 1 },
  { name: "lead(II)", f: "Pb", c: 2, r: 2 },
  { name: "magnesium", f: "Mg", c: 2, r: 0 },               // group 2
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
  { name: "bromide", f: "Br", a: 1, r: 0 },                 // halide
  { name: "chlorate", f: "ClO3", a: 1, poly: true, r: 1 },
  { name: "chloride", f: "Cl", a: 1, r: 0 },                // halide
  { name: "chlorite", f: "ClO2", a: 1, poly: true, r: 2 },
  { name: "cyanide", f: "CN", a: 1, poly: true, r: 1 },
  { name: "dihydrogenphosphate", f: "H2PO4", a: 1, poly: true, r: 3 },
  { name: "ethanoate", f: "CH3COO", a: 1, poly: true, r: 1 },
  { name: "fluoride", f: "F", a: 1, r: 0 },                 // halide
  { name: "hydrogencarbonate", f: "HCO3", a: 1, poly: true, r: 1 },
  { name: "hydrogensulfate", f: "HSO4", a: 1, poly: true, r: 2 },
  { name: "hydrogensulfide", f: "HS", a: 1, poly: true, r: 2 },
  { name: "hydrogensulfite", f: "HSO3", a: 1, poly: true, r: 2 },
  { name: "hydroxide", f: "OH", a: 1, poly: true, r: 0 },   // common
  { name: "hypochlorite", f: "ClO", a: 1, poly: true, r: 3, late: true }, // forced to the end
  { name: "iodide", f: "I", a: 1, r: 0 },                   // halide
  { name: "nitrate", f: "NO3", a: 1, poly: true, r: 0 },    // common
  { name: "nitrite", f: "NO2", a: 1, poly: true, r: 3, late: true },    // forced to the end
  { name: "perchlorate", f: "ClO4", a: 1, poly: true, r: 2 },
  { name: "permanganate", f: "MnO4", a: 1, poly: true, r: 1 },
  // 2-
  { name: "carbonate", f: "CO3", a: 2, poly: true, r: 0 },  // common
  { name: "chromate", f: "CrO4", a: 2, poly: true, r: 1 },
  { name: "dichromate", f: "Cr2O7", a: 2, poly: true, r: 2 },
  { name: "monohydrogenphosphate", f: "HPO4", a: 2, poly: true, r: 3, late: true }, // forced to the end
  { name: "oxide", f: "O", a: 2, r: 0 },                    // common
  { name: "peroxide", f: "O2", a: 2, poly: true, r: 2 },
  { name: "sulfate", f: "SO4", a: 2, poly: true, r: 0 },    // common
  { name: "sulfide", f: "S", a: 2, r: 0 },                  // common
  { name: "sulfite", f: "SO3", a: 2, poly: true, r: 1 },
  { name: "thiosulfate", f: "S2O3", a: 2, poly: true, r: 2 },
  // 3-
  { name: "citrate", f: "C6H5O7", a: 3, poly: true, r: 3 },
  { name: "nitride", f: "N", a: 3, r: 1 },
  { name: "phosphate", f: "PO4", a: 3, poly: true, r: 0 },  // common
];

function gcd(x, y) { return y === 0 ? x : gcd(y, x % y); }

// Neutral compound formula for a cation/anion pair (criss-cross + simplify).
function buildFormula(cat, an) {
  const g = gcd(cat.c, an.a);
  const catSub = an.a / g;
  const anSub = cat.c / g;
  return ionPart(cat, catSub) + ionPart(an, anSub);
}

function ionPart(ion, n) {
  if (n === 1) return ion.f;
  return ion.poly ? `(${ion.f})${n}` : `${ion.f}${n}`;
}

// Structural complexity (how fiddly the formula is to write).
function structural(cat, an) {
  const g = gcd(cat.c, an.a);
  const catSub = an.a / g;
  const anSub = cat.c / g;
  const parens = (cat.poly && catSub > 1) || (an.poly && anSub > 1);
  let s = 0;
  s += (cat.c - 1) * 1.2 + (an.a - 1) * 1.2;
  s += (cat.poly ? 1 : 0) + (an.poly ? 1 : 0);
  s += parens ? 3 : 0;
  s += (catSub > 1 ? 1 : 0) + (anSub > 1 ? 1 : 0);
  s += (catSub + anSub) * 0.25;
  return s; // ~0 .. ~14
}

// Overall difficulty:
//   * `late` ions (hypochlorite, nitrite, monohydrogenphosphate, ammonium) get a
//     huge offset so EVERY compound containing one sorts behind all others -> the end.
//   * otherwise familiarity tier dominates (x20, never overlapping the ~0..14
//     structural range), and structural complexity orders within a tier.
function difficulty(cat, an) {
  const lateCount = (cat.late ? 1 : 0) + (an.late ? 1 : 0);
  return lateCount * 1000 + (cat.r + an.r) * 20 + structural(cat, an);
}

function allCombos() {
  const out = [];
  for (const cat of CATIONS) {
    for (const an of ANIONS) {
      out.push({
        name: `${cat.name} ${an.name}`,
        answer: buildFormula(cat, an),
        score: difficulty(cat, an),
      });
    }
  }
  return out;
}

// 16 distinct compounds, rising from easy+common to hard+rare.
// Sort by difficulty, slice into 16 ascending bins, take one random per bin.
function buildQuiz() {
  const combos = allCombos().sort((p, q) => p.score - q.score || p.name.localeCompare(q.name));
  const n = combos.length;
  const chosen = [];
  const used = new Set();
  for (let i = 0; i < 16; i++) {
    const start = Math.floor((i * n) / 16);
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / 16));
    let pick = null;
    for (let tries = 0; tries < 12; tries++) {
      const cand = combos[start + Math.floor(Math.random() * (end - start))];
      if (!used.has(cand.answer)) { pick = cand; break; }
    }
    if (!pick) {
      pick = combos.slice(start, end).find((c) => !used.has(c.answer))
          || combos.find((c) => !used.has(c.answer));
    }
    used.add(pick.answer);
    chosen.push(pick);
  }
  return chosen; // already in ascending-difficulty order
}
