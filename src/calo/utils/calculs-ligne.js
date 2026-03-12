import { DN_TABLE } from './calculs';
import { longueurSegment, patronPoisson, patronLaine, rayonCintrage } from './calculs-coude';

/**
 * Types de tole disponibles
 */
export const TYPES_TOLE = [
  { id: 'isoxal', label: 'Isoxal (alu)', densite: 2700, defaultEp: 0.8 },
  { id: 'inox', label: 'Inox 304', densite: 7930, defaultEp: 0.5 },
  { id: 'galva', label: 'Galvanise', densite: 7850, defaultEp: 0.5 },
];

/**
 * Determine le type d'isolant selon le DN
 * DN <= 400 (De <= 406.4mm) : coquille pre-formee
 * DN > 400 : matelas laine de roche (coupe a plat)
 * @param {number} dn - DN nominal
 * @returns {'coquille' | 'matelas'}
 */
export function getInsulationType(dn) {
  return dn <= 400 ? 'coquille' : 'matelas';
}

/**
 * Calcule le nombre de coquilles necessaires pour un tuyau droit
 * Coquille standard = 1000mm (1m), composee de 2 demi-coquilles
 * @param {number} longueurMm - longueur en mm
 * @returns {number} nombre de coquilles
 */
export function getNbCoquilles(longueurMm) {
  return Math.ceil(longueurMm / 1000);
}

/**
 * Patron tuyau droit (rectangles simples)
 * Retourne { tole: {largeur, hauteur}, laine: {largeur, hauteur} }
 */
export function patronDroit(De, epIsolant, epTole, longueur, overlap = 30) {
  const rIsolant = De / 2 + epIsolant;
  const rTole = rIsolant + epTole;
  return {
    tole: {
      largeur: Math.round(Math.PI * 2 * rTole + overlap),
      hauteur: Math.round(longueur),
      developpee: Math.round(Math.PI * 2 * rTole),
      overlap,
    },
    laine: {
      largeur: Math.round(Math.PI * 2 * rIsolant),
      hauteur: Math.round(longueur),
      developpee: Math.round(Math.PI * 2 * rIsolant),
    },
  };
}

/**
 * Patron réduction (tronc de côone → secteur d'anneau)
 * De1 = diamètre ext tuyau grand côté (mm)
 * De2 = diamètre ext tuyau petit côté (mm)
 * longueur = longueur de la réduction (mm), typiquement 2x(De1-De2)
 */
export function patronReduction(De1, De2, longueur, epIsolant, epTole, overlap = 30) {
  const r1Tole = De1 / 2 + epIsolant + epTole;
  const r2Tole = De2 / 2 + epIsolant + epTole;
  const r1Laine = De1 / 2 + epIsolant;
  const r2Laine = De2 / 2 + epIsolant;

  // Géométrie tronc de cône: on calcule le sommet virtuel du cône
  // Generatrice du cone = sqrt(longueur^2 + (r1-r2)^2)
  const genTole = Math.sqrt(longueur * longueur + (r1Tole - r2Tole) * (r1Tole - r2Tole));
  const genLaine = Math.sqrt(longueur * longueur + (r1Laine - r2Laine) * (r1Laine - r2Laine));

  // Distance sommet du cone au grand cercle
  // Si r1 == r2, c'est un cylindre, pas de cône
  let Rgrand, Rpetit, angleSecteur;
  let RgrandL, RpetitL, angleSecteurL;

  if (Math.abs(r1Tole - r2Tole) < 0.1) {
    // Cylindre - pas de réduction réelle
    return patronDroit(De1, epIsolant, epTole, longueur, overlap);
  }

  // Tôle
  Rgrand = genTole * r1Tole / (r1Tole - r2Tole);
  Rpetit = Rgrand - genTole;
  angleSecteur = 2 * Math.PI * r1Tole / Rgrand; // en radians

  // Laine
  RgrandL = genLaine * r1Laine / (r1Laine - r2Laine);
  RpetitL = RgrandL - genLaine;
  angleSecteurL = 2 * Math.PI * r1Laine / RgrandL;

  // Générer les points du secteur d'anneau pour SVG
  function genererSecteur(Rg, Rp, angle, nbPoints = 40) {
    const points = [];
    // Arc extérieur
    for (let i = 0; i <= nbPoints; i++) {
      const a = (i / nbPoints) * angle;
      points.push({ x: Rg * Math.cos(a), y: Rg * Math.sin(a), arc: 'ext' });
    }
    // Arc intérieur (sens inverse)
    for (let i = nbPoints; i >= 0; i--) {
      const a = (i / nbPoints) * angle;
      points.push({ x: Rp * Math.cos(a), y: Rp * Math.sin(a), arc: 'int' });
    }
    return points;
  }

  return {
    tole: {
      type: 'cone',
      Rgrand: Math.round(Rgrand),
      Rpetit: Math.round(Rpetit),
      angleSecteurDeg: Math.round(angleSecteur * 180 / Math.PI),
      generatrice: Math.round(genTole),
      developpeeGrand: Math.round(2 * Math.PI * r1Tole),
      developpeePetit: Math.round(2 * Math.PI * r2Tole),
      points: genererSecteur(Rgrand, Rpetit, angleSecteur),
      overlap,
    },
    laine: {
      type: 'cone',
      Rgrand: Math.round(RgrandL),
      Rpetit: Math.round(RpetitL),
      angleSecteurDeg: Math.round(angleSecteurL * 180 / Math.PI),
      generatrice: Math.round(genLaine),
      developpeeGrand: Math.round(2 * Math.PI * r1Laine),
      developpeePetit: Math.round(2 * Math.PI * r2Laine),
      points: genererSecteur(RgrandL, RpetitL, angleSecteurL),
    },
  };
}

/**
 * Patron Té (intersection cylindre/cylindre)
 * Le collecteur a un trou, le piquage a une courbe d'intersection
 */
export function patronTe(DeCollecteur, DePiquage, epIsolant, epTole, overlap = 30) {
  const rcTole = DeCollecteur / 2 + epIsolant + epTole;
  const rpTole = DePiquage / 2 + epIsolant + epTole;
  const rcLaine = DeCollecteur / 2 + epIsolant;
  const rpLaine = DePiquage / 2 + epIsolant;

  // Courbe d'intersection: pour un angle theta autour du piquage (0 à 2PI)
  // hauteur h(theta) = rc - sqrt(rc^2 - (rp * sin(theta))^2)
  // (mesurée depuis le sommet du collecteur)
  function courbeIntersection(rc, rp, nbPoints = 60) {
    const points = [];
    const circ = 2 * Math.PI * rp;
    for (let i = 0; i <= nbPoints; i++) {
      const theta = (i / nbPoints) * 2 * Math.PI;
      const sinT = Math.sin(theta);
      const val = rc * rc - rp * rp * sinT * sinT;
      const h = val > 0 ? rc - Math.sqrt(val) : rc;
      points.push({
        x: (i / nbPoints) * circ,
        y: h,
      });
    }
    return points;
  }

  // Patron du piquage (la forme en selle de cheval)
  const piquageTole = courbeIntersection(rcTole, rpTole);
  const piquageLaine = courbeIntersection(rcLaine, rpLaine);

  // Hauteur du piquage (typiquement = 2x le diamètre du piquage)
  const hPiquage = DePiquage * 2;

  // Le patron complet du piquage = rectangle avec le bord bas qui suit la courbe d'intersection
  // Hauteur totale = hPiquage + hMax de la courbe
  const hMaxTole = Math.max(...piquageTole.map(p => p.y));
  const hMaxLaine = Math.max(...piquageLaine.map(p => p.y));

  return {
    // Patron du piquage (forme selle de cheval)
    piquage: {
      tole: {
        largeur: Math.round(2 * Math.PI * rpTole + overlap),
        hauteurDroite: Math.round(hPiquage),
        hauteurCourbure: Math.round(hMaxTole),
        courbe: piquageTole,
        developpee: Math.round(2 * Math.PI * rpTole),
      },
      laine: {
        largeur: Math.round(2 * Math.PI * rpLaine),
        hauteurDroite: Math.round(hPiquage),
        hauteurCourbure: Math.round(hMaxLaine),
        courbe: piquageLaine,
        developpee: Math.round(2 * Math.PI * rpLaine),
      },
    },
    // Info sur le trou dans le collecteur
    collecteur: {
      trouDiamTole: Math.round(2 * rpTole),
      trouDiamLaine: Math.round(2 * rpLaine),
      note: 'Decoupe circulaire dans le collecteur',
    },
  };
}

/**
 * Patron Piquage (similaire au Te mais avec 3 diametres differents)
 * DeEntree = diametre ext tuyau entree (mm)
 * DeSortie = diametre ext tuyau sortie (mm)
 * DePiquage = diametre ext branche (mm)
 */
export function patronPiquage(DeEntree, DeSortie, DePiquage, epIsolant, epTole, overlap = 30) {
  // On utilise le collecteur avec le diametre moyen entre entree et sortie
  const DeAvg = (DeEntree + DeSortie) / 2;
  // La branche utilise DePiquage
  // On reutilise la logique du patronTe avec le collecteur = DeAvg et le piquage = DePiquage
  return patronTe(DeAvg, DePiquage, epIsolant, epTole, overlap);
}

/**
 * Calcule la surface de chaque pièce pour le récapitulatif
 */
export function calcSurfacePiece(piece, dnCourant, epIsolant, epTole, rayonFacteur) {
  const De = DN_TABLE[dnCourant] || 114.3;
  const rIsolant = De / 2 + epIsolant;
  const rTole = rIsolant + epTole;
  const insulType = getInsulationType(dnCourant);

  switch (piece.type) {
    case 'droit': {
      const longueurMm = piece.longueur || 1000;
      const L = longueurMm / 1000; // en mètres
      const surfTole = Math.PI * 2 * rTole / 1000 * L;
      const surfLaine = Math.PI * 2 * rIsolant / 1000 * L;
      const extra = {};
      if (insulType === 'coquille') {
        extra.nbCoquilles = getNbCoquilles(longueurMm);
        extra.insulType = 'coquille';
      } else {
        extra.insulType = 'matelas';
      }
      return { surfTole: round(surfTole, 3), surfLaine: round(surfLaine, 3), ...extra };
    }
    case 'coude90':
    case 'casse': {
      const angle = piece.type === 'coude90' ? 90 : 45;
      const R = rayonCintrage(dnCourant, rayonFacteur);
      const angleRad = (angle * Math.PI) / 180;
      // Surface = 2*PI*R*r * angle (la moyenne sur le tour complet)
      const surfTole = 2 * Math.PI * R * rTole * angleRad / 1e6;
      const surfLaine = 2 * Math.PI * R * rIsolant * angleRad / 1e6;
      return { surfTole: round(surfTole, 3), surfLaine: round(surfLaine, 3), insulType };
    }
    case 'reduction': {
      const De2 = DN_TABLE[piece.dnSortie] || De;
      const r2Tole = De2 / 2 + epIsolant + epTole;
      const r2Laine = De2 / 2 + epIsolant;
      const L = (piece.longueur || Math.abs(De - De2) * 2) / 1000;
      const surfTole = Math.PI * (rTole + r2Tole) / 1000 * L;
      const surfLaine = Math.PI * (rIsolant + r2Laine) / 1000 * L;
      return { surfTole: round(surfTole, 3), surfLaine: round(surfLaine, 3), insulType };
    }
    case 'te': {
      // Collecteur (~1m) + piquage (~0.5m de hauteur)
      const DePiq = DN_TABLE[piece.dnPiquage || dnCourant] || De;
      const rPiqTole = DePiq / 2 + epIsolant + epTole;
      const rPiqLaine = DePiq / 2 + epIsolant;
      const Lcoll = 0.5; // 500mm de collecteur autour du piquage
      const Lpiq = DePiq / 1000; // hauteur piquage = 1x diamètre
      const surfTole = Math.PI * 2 * rTole / 1000 * Lcoll + Math.PI * 2 * rPiqTole / 1000 * Lpiq;
      const surfLaine = Math.PI * 2 * rIsolant / 1000 * Lcoll + Math.PI * 2 * rPiqLaine / 1000 * Lpiq;
      return { surfTole: round(surfTole, 3), surfLaine: round(surfLaine, 3), insulType };
    }
    case 'piquage': {
      const De1 = DN_TABLE[dnCourant] || dnCourant;
      const De2 = DN_TABLE[piece.dnSortie] || piece.dnSortie || De1;
      const DePiq = DN_TABLE[piece.dnPiquage] || piece.dnPiquage || De1;
      const r1 = (De1 + 2 * epIsolant) / 2;
      const r2 = (De2 + 2 * epIsolant) / 2;
      const rPiq = (DePiq + 2 * epIsolant) / 2;
      const hPiq = (piece.hauteurPiquage || 150) / 1000;
      // Collecteur approximated as average of entry and exit
      const rAvg = (r1 + r2) / 2;
      const collecteurL = (rAvg * 2 + 100) / 1000; // length covered
      const surfToleCalc = (2 * Math.PI * (rAvg + epTole) / 1000 * collecteurL) + (2 * Math.PI * (rPiq + epTole) / 1000 * hPiq);
      const surfLaineCalc = surfToleCalc * 0.95;
      return { surfTole: round(surfToleCalc, 3), surfLaine: round(surfLaineCalc, 3), insulType };
    }
    default:
      return { surfTole: 0, surfLaine: 0, insulType };
  }
}

/**
 * Calcul récapitulatif de toute la ligne
 */
export function calcRecapLigne(pieces, params) {
  const { dnDepart, epIsolant, epTole, rayonFacteur, typeTole } = params;
  let dnCourant = dnDepart;
  let totalSurfTole = 0;
  let totalSurfLaine = 0;
  let totalCoquilles = 0;
  const detailPieces = [];

  for (const piece of pieces) {
    const surf = calcSurfacePiece(piece, dnCourant, epIsolant, epTole, rayonFacteur);
    detailPieces.push({ ...piece, ...surf, dn: dnCourant });
    totalSurfTole += surf.surfTole;
    totalSurfLaine += surf.surfLaine;
    if (surf.nbCoquilles) totalCoquilles += surf.nbCoquilles;

    // Mise à jour DN si réduction ou piquage
    if ((piece.type === 'reduction' || piece.type === 'piquage') && piece.dnSortie) {
      dnCourant = piece.dnSortie;
    }
  }

  // Poids tôle selon le type choisi
  const toleInfo = TYPES_TOLE.find(t => t.id === typeTole) || TYPES_TOLE[0];
  const poidsTole = round(totalSurfTole * (epTole / 1000) * toleInfo.densite, 2);

  // Accessoires
  const nbRivets = Math.ceil(totalSurfTole * 6);
  const longueurBandeAlu = round(totalSurfTole * 1.5, 1);
  const nbLigatures = Math.ceil(totalSurfLaine / 0.5 * 2); // ~2 par 0.5m²

  return {
    detailPieces,
    totalSurfTole: round(totalSurfTole, 2),
    totalSurfLaine: round(totalSurfLaine, 2),
    poidsTole,
    totalCoquilles,
    toleInfo,
    nbRivets,
    longueurBandeAlu,
    nbLigatures,
  };
}

function round(val, dec) {
  const f = 10 ** dec;
  return Math.round(val * f) / f;
}
