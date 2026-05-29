// Ion data — EXACTLY the cations and anions from the reference sheet, nothing else.
//   c / a = charge magnitude
//   poly  = polyatomic (needs parentheses when subscripted)
//   r     = rarity / unfamiliarity 0..3 (0 = very common, 3 = exotic) -> used to
//           order the quiz from easy+common towards hard+rare.

const CATIONS = [
  { name: "ammonium", f: "NH4", c: 1, poly: true, r: 0 },
  { name: "copper(I)", f: "Cu", c: 1, r: 2 },
  { name: "hydronium", f: "H3O", c: 1, poly: true, r: 3 },
  { name: "lithium", f: "Li", c: 1, r: 1 },
  { name: "potassium", f: "K", c: 1, r: 0 },
  { name: "silver", f: "Ag", c: 1, r: 1 },
  { name: "sodium", f: "Na", c: 1, r: 0 },
  { name: "barium", f: "Ba", c: 2, r: 1 },
  { name: "calcium", f: "Ca", c: 2, r: 0 },
  { name: "copper(II)", f: "Cu", c: 2, r: 0 },
  { name: "iron(II)", f: "Fe", c: 2, r: 0 },
  { name: "lead(II)", f: "Pb", c: 2, r: 1 },
  { name: "magnesium", f: "Mg", c: 2, r: 0 },
  { name: "mercury(II)", f: "Hg", c: 2, r: 2 },
  { name: "nickel(II)", f: "Ni", c: 2, r: 1 },
  { name: "tin(II)", f: "Sn", c: 2, r: 1 },
  { name: "zinc", f: "Zn", c: 2, r: 0 },
  { name: "aluminium", f: "Al", c: 3, r: 0 },
  { name: "chromium(III)", f: "Cr", c: 3, r: 1 },
  { name: "iron(III)", f: "Fe", c: 3, r: 0 },
  { name: "titanium(IV)", f: "Ti", c: 4, r: 3 },
];

const ANIONS = [
  // 1-
  { name: "bromide", f: "Br", a: 1, r: 0 },
  { name: "chlorate", f: "ClO3", a: 1, poly: true, r: 1 },
  { name: "chloride", f: "Cl", a: 1, r: 0 },
  { name: "chlorite", f: "ClO2", a: 1, poly: true, r: 2 },
  { name: "cyanide", f: "CN", a: 1, poly: true, r: 1 },
  { name: "dihydrogenphosphate", f: "H2PO4", a: 1, poly: true, r: 3 },
  { name: "ethanoate", f: "CH3COO", a: 1, poly: true, r: 1 },
  { name: "fluoride", f: "F", a: 1, r: 0 },
  { name: "hydrogencarbonate", f: "HCO3", a: 1, poly: true, r: 1 },
  { name: "hydrogensulfate", f: "HSO4", a: 1, poly: true, r: 2 },
  { name: "hydrogensulfide", f: "HS", a: 1, poly: true, r: 3 },
  { name: "hydrogensulfite", f: "HSO3", a: 1, poly: true, r: 3 },
  { name: "hydroxide", f: "OH", a: 1, poly: true, r: 0 },
  { name: "hypochlorite", f: "ClO", a: 1, poly: true, r: 2 },
  { name: "iodide", f: "I", a: 1, r: 0 },
  { name: "nitrate", f: "NO3", a: 1, poly: true, r: 0 },
  { name: "nitrite", f: "NO2", a: 1, poly: true, r: 1 },
  { name: "perchlorate", f: "ClO4", a: 1, poly: true, r: 2 },
  { name: "permanganate", f: "MnO4", a: 1, poly: true, r: 1 },
  // 2-
  { name: "carbonate", f: "CO3", a: 2, poly: true, r: 0 },
  { name: "chromate", f: "CrO4", a: 2, poly: true, r: 1 },
  { name: "dichromate", f: "Cr2O7", a: 2, poly: true, r: 2 },
  { name: "monohydrogenphosphate", f: "HPO4", a: 2, poly: true, r: 3 },
  { name: "oxide", f: "O", a: 2, r: 0 },
  { name: "peroxide", f: "O2", a: 2, poly: true, r: 2 },
  { name: "sulfate", f: "SO4", a: 2, poly: true, r: 0 },
  { name: "sulfide", f: "S", a: 2, r: 0 },
  { name: "sulfite", f: "SO3", a: 2, poly: true, r: 1 },
  { name: "thiosulfate", f: "S2O3", a: 2, poly: true, r: 2 },
  // 3-
  { name: "citrate", f: "C6H5O7", a: 3, poly: true, r: 3 },
  { name: "nitride", f: "N", a: 3, r: 1 },
  { name: "phosphate", f: "PO4", a: 3, poly: true, r: 0 },
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

// Difficulty = structural complexity + how uncommon the ions are.
// Higher = harder/less common -> appears later in the quiz.
function difficulty(cat, an) {
  const g = gcd(cat.c, an.a);
  const catSub = an.a / g;
  const anSub = cat.c / g;
  const parens = (cat.poly && catSub > 1) || (an.poly && anSub > 1);
  let s = 0;
  // structural
  s += (cat.c - 1) * 1.2 + (an.a - 1) * 1.2;
  s += (cat.poly ? 1 : 0) + (an.poly ? 1 : 0);
  s += parens ? 3 : 0;
  s += (catSub > 1 ? 1 : 0) + (anSub > 1 ? 1 : 0);
  s += (catSub + anSub) * 0.25;
  // commonness (familiarity) — weighted so common compounds come first
  s += (cat.r + an.r) * 1.6;
  return s;
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
