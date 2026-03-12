/* ─── Maths coude ─── */

// Options de rayon de cintrage
export const RAYON_OPTIONS = [
  { facteur: 1.0, label: '1.0xDN (court)' },
  { facteur: 1.5, label: '1.5xDN (standard)' },
  { facteur: 2.0, label: '2.0xDN (long)' },
];

// Rayon de cintrage (facteur x DN)
export function rayonCintrage(dn, facteur = 1.5) {
  return facteur * dn; // mm
}

// Developpee d'un segment de coude (le "poisson")
// theta = position angulaire autour du tuyau (0 a 2PI)
// R = rayon de cintrage (centre coude au centre tuyau)
// r = rayon exterieur (avec isolant + tole)
// beta = angle du segment en radians
export function longueurSegment(theta, R, r, beta) {
  return (R + r * Math.cos(theta)) * beta;
}

// Generer le patron poisson pour un segment
// overlap = recouvrement en mm (30mm standard pour assemblage)
export function patronPoisson(R, rExt, beta, nbPoints = 60, overlap = 30) {
  const circExt = Math.PI * 2 * rExt; // circonference exterieure
  const totalWidth = circExt + overlap; // largeur avec recouvrement
  const points = [];
  for (let i = 0; i <= nbPoints; i++) {
    const theta = (i / nbPoints) * 2 * Math.PI;
    const x = (i / nbPoints) * totalWidth;
    const y = longueurSegment(theta, R, rExt, beta);
    points.push({ x, y });
  }
  return points;
}

// Patron laine de verre (sur le diametre isolant, pas la tole)
export function patronLaine(R, rIsolant, beta, nbPoints = 60) {
  const circ = Math.PI * 2 * rIsolant;
  const points = [];
  for (let i = 0; i <= nbPoints; i++) {
    const theta = (i / nbPoints) * 2 * Math.PI;
    const x = (i / nbPoints) * circ;
    const y = longueurSegment(theta, R, rIsolant, beta);
    points.push({ x, y });
  }
  return points;
}

// Projection 3D isometrique
export function project3D(x, y, z, rotX, rotY) {
  // Rotation Y
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  let x1 = x * cosY + z * sinY;
  let z1 = -x * sinY + z * cosY;
  // Rotation X
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  let y1 = y * cosX - z1 * sinX;
  let z2 = y * sinX + z1 * cosX;
  return { x: x1, y: y1, z: z2 };
}
