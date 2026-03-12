// Correspondance DN → Diamètre extérieur réel (mm)
export const DN_TABLE = {
  15: 21.3, 20: 26.9, 25: 33.7, 32: 42.4, 40: 48.3,
  50: 60.3, 65: 76.1, 80: 88.9, 100: 114.3, 125: 139.7,
  150: 168.3, 200: 219.1, 250: 273.0, 300: 323.9,
  350: 355.6, 400: 406.4, 450: 457.0, 500: 508.0,
};

export const DN_LIST = Object.keys(DN_TABLE).map(Number);

// Matériaux isolants : conductivité λ (W/m·K), densité (kg/m³)
export const MATERIAUX_ISOLANTS = {
  'Laine de roche': { lambda: 0.040, densite: 80 },
  'Laine de verre': { lambda: 0.035, densite: 48 },
  'Mousse PUR': { lambda: 0.025, densite: 35 },
  'Mousse PIR': { lambda: 0.023, densite: 32 },
  'Elastomere (Armaflex)': { lambda: 0.036, densite: 60 },
  'Silicate de calcium': { lambda: 0.065, densite: 240 },
  'Verre cellulaire (Foamglas)': { lambda: 0.042, densite: 130 },
  'Laine de roche haute densite': { lambda: 0.038, densite: 150 },
};

// Finitions
export const FINITIONS = ['Tole aluminium 0.6mm', 'Tole aluminium 0.8mm', 'Tole inox 304', 'Tole inox 316L', 'Tole galvanisee', 'PVC blanc', 'Bandes alu adhesives', 'Enduit + toile'];

// Classes d'isolation DTU 45.2 (NF EN ISO 12241)
// Epaisseurs minimales en mm par DN, pour lambda = 0.035 W/(m.K)
export const DTU_45_2_CLASSES = {
  1: { label: 'Classe 1 - Anti-gel', epaisseurs: { 15: 10, 20: 10, 32: 10, 50: 15, 80: 15, 100: 20, 150: 20, 200: 25 } },
  2: { label: 'Classe 2 - Anti-condensation', epaisseurs: { 15: 15, 20: 15, 32: 20, 50: 20, 80: 25, 100: 25, 150: 30, 200: 30 } },
  3: { label: 'Classe 3 - Maintien temperature', epaisseurs: { 15: 20, 20: 20, 32: 25, 50: 30, 80: 30, 100: 40, 150: 40, 200: 50 } },
  4: { label: 'Classe 4 - CEE / Reglementaire', epaisseurs: { 15: 25, 20: 25, 32: 30, 50: 40, 80: 40, 100: 50, 150: 60, 200: 60 } },
  5: { label: 'Classe 5 - Haute performance', epaisseurs: { 15: 30, 20: 35, 32: 40, 50: 60, 80: 60, 100: 70, 150: 80, 200: 80 } },
  6: { label: 'Classe 6 - Performance maximale', epaisseurs: { 15: 40, 20: 50, 32: 60, 50: 80, 80: 80, 100: 100, 150: 100, 200: 120 } },
};

// Ratios d'accessoires pour un metre tuyauterie
export const ACCESSOIRES_RATIOS = {
  rivets_par_m2: 6,        // rivets alu par m2 de tole
  vis_par_m2: 4,            // vis autoperceuses par m2 de tole
  bande_alu_par_m2: 1.5,    // metres lineaires de bande alu par m2
  mastic_par_m2: 0.3,       // kg de mastic par m2
  fil_ligature_par_ml: 2,   // ligatures par metre lineaire
  colle_par_m2: 0.3,        // kg de colle par m2
};

/**
 * Calcul métrés tuyauterie
 * De = diamètre ext tuyau (mm)
 * ep = épaisseur isolant (mm)
 * L  = longueur tronçon (m)
 */
export function calcTuyauterie(De, ep, L, materiau, finition) {
  const DeMm = De; // mm
  const diamExtIsolant = DeMm + 2 * ep; // mm
  const diamExtIsolantM = diamExtIsolant / 1000; // m
  const DeM = DeMm / 1000;

  // Surface développée isolant (m²)
  const surfaceIsolant = Math.PI * diamExtIsolantM * L;

  // Surface finition avec 5% de chutes
  const surfaceFinition = surfaceIsolant * 1.05;

  // Volume isolant (m³) = π/4 × (D_ext_isolant² - D_ext_tuyau²) × L
  const volumeIsolant = (Math.PI / 4) * (diamExtIsolantM ** 2 - DeM ** 2) * L;

  // Poids isolant
  const mat = MATERIAUX_ISOLANTS[materiau];
  const poidsIsolant = mat ? volumeIsolant * mat.densite : 0;

  // Fil de ligature : ~2 ligatures par mètre linéaire, chaque ligature = périmètre + 15cm
  const nbLigatures = Math.ceil(L * 2);
  const longueurFil = nbLigatures * (Math.PI * diamExtIsolantM + 0.15);

  // Colle / mastic : ~0.3 kg/m² de surface isolant
  const quantiteColle = surfaceIsolant * 0.3;

  return {
    diamExtIsolant,
    surfaceIsolant: round(surfaceIsolant, 2),
    surfaceFinition: round(surfaceFinition, 2),
    volumeIsolant: round(volumeIsolant, 4),
    poidsIsolant: round(poidsIsolant, 1),
    nbLigatures,
    longueurFil: round(longueurFil, 1),
    quantiteColle: round(quantiteColle, 2),
    nbRivets: Math.ceil(surfaceFinition * 6),
    nbVis: Math.ceil(surfaceFinition * 4),
    longueurBandeAlu: round(surfaceFinition * 1.5, 1),
  };
}

/**
 * Calcul métrés équipements plats
 */
export function calcPlat(forme, dims, ep) {
  const { L, l, H, D } = dims; // mm
  const epM = ep / 1000;
  let surfaceTotale = 0;

  if (forme === 'rectangulaire') {
    const Lm = L / 1000, lm = l / 1000, Hm = H / 1000;
    // 4 faces latérales + dessus + dessous
    surfaceTotale = 2 * (Lm + 2 * epM) * (Hm + 2 * epM) +
                    2 * (lm + 2 * epM) * (Hm + 2 * epM) +
                    2 * (Lm + 2 * epM) * (lm + 2 * epM);
  } else if (forme === 'cylindrique vertical') {
    const Dm = (D || 1000) / 1000, Hm = (H || 1000) / 1000;
    const Dext = Dm + 2 * epM;
    surfaceTotale = Math.PI * Dext * Hm + 2 * Math.PI * (Dext / 2) ** 2;
  } else if (forme === 'sphérique') {
    const Dm = (D || 1000) / 1000;
    const Dext = Dm + 2 * epM;
    surfaceTotale = Math.PI * Dext ** 2;
  }

  // Avec 8% recouvrement joints
  const surfaceAvecRecouvrement = surfaceTotale * 1.08;

  // Nombre de plaques 1000×500mm
  const surfacePlaque1000x500 = 0.5; // m²
  const nbPlaques1000x500 = Math.ceil(surfaceAvecRecouvrement / surfacePlaque1000x500);

  // Nombre de plaques 1200×600mm
  const surfacePlaque1200x600 = 0.72; // m²
  const nbPlaques1200x600 = Math.ceil(surfaceAvecRecouvrement / surfacePlaque1200x600);

  // Vis/rivets : ~6 par m²
  const nbFixations = Math.ceil(surfaceAvecRecouvrement * 6);

  return {
    surfaceTotale: round(surfaceTotale, 2),
    surfaceAvecRecouvrement: round(surfaceAvecRecouvrement, 2),
    nbPlaques1000x500,
    nbPlaques1200x600,
    nbFixations,
  };
}

/**
 * Calcul épaisseur d'isolant recommandée
 * Tfl = température fluide (°C)
 * Tamb = température ambiante (°C)
 * De = diamètre extérieur tuyau (mm) — 0 pour surface plane
 * lambda = conductivité isolant (W/m·K)
 * objectif = 'condensation' | 'pertes' | 'toucher'
 */
export function calcEpaisseur(Tfl, Tamb, De, lambda, objectif) {
  const DeM = De / 1000;
  const ri = DeM / 2;
  const he = 10; // coeff échange ext (W/m²·K)
  const deltaT = Math.abs(Tfl - Tamb);

  let epaisseurMm;

  if (objectif === 'toucher') {
    // Température de surface max = 55°C
    const Ts = 55;
    if (Tfl <= Ts) return { epaisseurMm: 0, message: 'Pas besoin d\'isolant (T < 55°C)' };

    if (De > 0) {
      // Cylindrique : itération
      epaisseurMm = solveEpaisseurCyl(ri, lambda, he, Tfl, Tamb, Ts);
    } else {
      // Plan : e = λ × (Tfl - Ts) / (he × (Ts - Tamb))
      epaisseurMm = (lambda * (Tfl - Ts) / (he * (Ts - Tamb))) * 1000;
    }
  } else if (objectif === 'condensation') {
    // Surface > point de rosée (~15°C à 60% HR)
    const Trosee = 12;
    const Ts = Trosee + 2; // marge
    if (Tamb <= Ts) {
      epaisseurMm = 20;
    } else if (De > 0) {
      epaisseurMm = solveEpaisseurCyl(ri, lambda, he, Tfl, Tamb, Ts);
    } else {
      epaisseurMm = (lambda * (Tamb - Tfl) / (he * (Tamb - Ts))) * 1000;
    }
  } else {
    // Pertes thermiques : viser R >= 1.2 m²·K/W
    const Rcible = 1.2;
    if (De > 0) {
      // R = ln(re/ri) / (2π λ) → re = ri × exp(2π λ R)
      const re = ri * Math.exp(2 * Math.PI * lambda * Rcible);
      epaisseurMm = (re - ri) * 1000;
    } else {
      epaisseurMm = Rcible * lambda * 1000;
    }
  }

  epaisseurMm = Math.max(10, Math.ceil(epaisseurMm / 5) * 5); // Arrondir au 5mm supérieur

  // Calcul résistance thermique et flux obtenu
  const epM = epaisseurMm / 1000;
  let R, flux;
  if (De > 0) {
    const re = ri + epM;
    R = Math.log(re / ri) / (2 * Math.PI * lambda);
    flux = deltaT / (R + 1 / (2 * Math.PI * re * he)); // W/m
  } else {
    R = epM / lambda;
    flux = deltaT / (R + 1 / he); // W/m²
  }

  return {
    epaisseurMm,
    R: round(R, 3),
    flux: round(flux, 1),
  };
}

function solveEpaisseurCyl(ri, lambda, he, Tfl, Tamb, TsCible) {
  // Itération pour trouver l'épaisseur
  for (let ep = 5; ep <= 300; ep += 5) {
    const re = ri + ep / 1000;
    const R = Math.log(re / ri) / (2 * Math.PI * lambda);
    const Rtot = R + 1 / (2 * Math.PI * re * he);
    const Ts = Tfl - (Tfl - Tamb) * (1 / (2 * Math.PI * re * he)) / Rtot;
    // Pour chaud : Ts doit être <= TsCible
    // Pour froid : Ts doit être >= TsCible
    if (Tfl > Tamb && Ts <= TsCible) return ep;
    if (Tfl < Tamb && Ts >= TsCible) return ep;
  }
  return 300;
}

function round(val, dec) {
  const f = 10 ** dec;
  return Math.round(val * f) / f;
}
