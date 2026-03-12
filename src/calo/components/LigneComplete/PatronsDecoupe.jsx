import { useState, useRef } from 'react';
import { DN_TABLE } from '../../utils/calculs';
import { rayonCintrage, patronPoisson, patronLaine } from '../../utils/calculs-coude';
import { patronDroit, patronReduction, patronTe, patronPiquage, TYPES_TOLE, getInsulationType, getNbCoquilles } from '../../utils/calculs-ligne';

/* ─── Couleurs par type de piece ─── */
const TYPE_COLORS = {
  droit:     { bg: '#3b82f6', text: '#2563eb', label: 'Tuyau droit' },
  coude90:   { bg: '#f97316', text: '#ea580c', label: 'Coude 90' },
  casse:     { bg: '#f59e0b', text: '#d97706', label: 'Cassé' },
  reduction: { bg: '#8b5cf6', text: '#7c3aed', label: 'Reduction' },
  te:        { bg: '#22c55e', text: '#16a34a', label: 'Te' },
  piquage:   { bg: '#ec4899', text: '#be185d', label: 'Piquage' },
};

/* ─── SVG Defs partagees (hachures, metallic gradient) ─── */
function SharedDefs() {
  return (
    <defs>
      {/* Gradient metallique pour la tole */}
      <linearGradient id="metallicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#cfd8dc" stopOpacity="0.6" />
        <stop offset="30%" stopColor="#eceff1" stopOpacity="0.4" />
        <stop offset="60%" stopColor="#b0bec5" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#90a4ae" stopOpacity="0.3" />
      </linearGradient>
      {/* Hachures diagonales pour la laine */}
      <pattern id="laineHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#f59e0b" strokeWidth="0.8" strokeOpacity="0.35" />
      </pattern>
      <pattern id="laineHatch2" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#f59e0b" strokeWidth="0.6" strokeOpacity="0.2" />
      </pattern>
    </defs>
  );
}

/* ─── Grille SVG de fond ─── */
function SvgGrid({ width, height }) {
  const lines = [];
  for (let x = 0; x <= width; x += 20) {
    lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={height}
      stroke="#e5e7eb" strokeWidth="0.4" />);
  }
  for (let y = 0; y <= height; y += 20) {
    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={width} y2={y}
      stroke="#e5e7eb" strokeWidth="0.4" />);
  }
  return <>{lines}</>;
}

/* ─── Barre d'echelle ─── */
function ScaleBar({ x, y, scalePixPerMm, barMm = 100 }) {
  const barPx = barMm * scalePixPerMm;
  if (barPx < 15 || barPx > 280) return null;
  return (
    <g>
      <rect x={x} y={y - 2} width={barPx} height={4} fill="#1d1d1f" rx="1" />
      <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke="#1d1d1f" strokeWidth="1" />
      <line x1={x + barPx} y1={y - 5} x2={x + barPx} y2={y + 5} stroke="#1d1d1f" strokeWidth="1" />
      <text x={x + barPx / 2} y={y - 7} textAnchor="middle" fontSize="7" fill="#1d1d1f" fontWeight="600">
        {barMm} mm
      </text>
    </g>
  );
}

/* ─── Ligne de cote avec fleches ─── */
function CoteLine({ x1, y1, x2, y2, label, color = '#1565c0', fontSize = 9, side = 'bottom' }) {
  const isHorizontal = Math.abs(y1 - y2) < 1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  if (isHorizontal) {
    const tickLen = 4;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" />
        <line x1={x1} y1={y1 - tickLen} x2={x1} y2={y1 + tickLen} stroke={color} strokeWidth="1" />
        <line x1={x2} y1={y2 - tickLen} x2={x2} y2={y2 + tickLen} stroke={color} strokeWidth="1" />
        <text x={mx} y={side === 'bottom' ? y1 + 12 : y1 - 4} textAnchor="middle"
          fontSize={fontSize} fontWeight="bold" fill={color}>{label}</text>
      </g>
    );
  }
  const tickLen = 4;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" />
      <line x1={x1 - tickLen} y1={y1} x2={x1 + tickLen} y2={y1} stroke={color} strokeWidth="1" />
      <line x1={x2 - tickLen} y1={y2} x2={x2 + tickLen} y2={y2} stroke={color} strokeWidth="1" />
      <text x={x1 + (side === 'right' ? 8 : -4)} y={my + 3} textAnchor={side === 'right' ? 'start' : 'end'}
        fontSize={fontSize} fontWeight="bold" fill={color}>{label}</text>
    </g>
  );
}

/* ─── Helpers fill/stroke par mode tole/laine ─── */
function getFill(showTole) {
  return showTole ? 'url(#metallicGrad)' : 'rgba(253,216,53,0.18)';
}
function getHatchFill(showTole) {
  return showTole ? 'none' : 'url(#laineHatch)';
}
function getHatchFill2(showTole) {
  return showTole ? 'none' : 'url(#laineHatch2)';
}
function getStroke(showTole) {
  return showTole ? '#546e7a' : '#f59e0b';
}
function getOverlapFill(showTole) {
  return showTole ? 'rgba(100,181,246,0.18)' : 'transparent';
}
function getOverlapStroke() {
  return '#42a5f5';
}

/* ═══════════════════════════════════════════════
   PATRON TUYAU DROIT (Rectangle)
   ═══════════════════════════════════════════════ */
function PatronDroitSVG({ tole, laine, showTole }) {
  const data = showTole ? tole : laine;
  const { largeur, hauteur } = data;
  const overlap = showTole ? (tole.overlap || 30) : 0;
  const developpee = data.developpee || (largeur - overlap);

  const margin = 30;
  const svgW = 320;
  const maxDim = Math.max(largeur, hauteur);
  const sc = (svgW - 2 * margin - 20) / maxDim;
  const drawW = largeur * sc;
  const drawH = hauteur * sc;
  const svgH = drawH + 2 * margin + 25;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full rounded-lg">
      <SharedDefs />
      <SvgGrid width={svgW} height={svgH} />

      {/* Rectangle principal */}
      <rect x={margin} y={margin} width={drawW} height={drawH}
        fill={getFill(showTole)} stroke={getStroke(showTole)} strokeWidth="2" rx="1" />
      {/* Hachures laine par-dessus */}
      {!showTole && (
        <>
          <rect x={margin} y={margin} width={drawW} height={drawH}
            fill={getHatchFill(showTole)} />
          <rect x={margin} y={margin} width={drawW} height={drawH}
            fill={getHatchFill2(showTole)} />
        </>
      )}

      {/* Zone de recouvrement (bande droite) */}
      {overlap > 0 && (
        <rect x={margin + developpee * sc} y={margin} width={overlap * sc} height={drawH}
          fill={getOverlapFill(showTole)} stroke={getOverlapStroke()} strokeWidth="1" strokeDasharray="4,3" rx="0.5" />
      )}

      {/* Cote largeur */}
      <CoteLine x1={margin} y1={svgH - 14} x2={margin + drawW} y2={svgH - 14}
        label={`${largeur} mm`} color={showTole ? '#1565c0' : '#b45309'} side="bottom" />

      {/* Cote hauteur */}
      <CoteLine x1={svgW - 12} y1={margin} x2={svgW - 12} y2={margin + drawH}
        label={`${hauteur} mm`} color="#c62828" side="right" />

      {/* Label recouvrement */}
      {overlap > 0 && (
        <text x={margin + (developpee + overlap / 2) * sc} y={margin + drawH / 2}
          textAnchor="middle" fontSize="7" fill="#42a5f5" fontWeight="600"
          transform={`rotate(-90, ${margin + (developpee + overlap / 2) * sc}, ${margin + drawH / 2})`}>
          Recouvr. {overlap}mm
        </text>
      )}

      {/* Barre d'echelle */}
      <ScaleBar x={margin} y={svgH - 2} scalePixPerMm={sc} barMm={100} />
    </svg>
  );
}

/* ═══════════════════════════════════════════════
   PATRON COUDE (Poisson)
   ═══════════════════════════════════════════════ */
function PatronCoudeSVG({ R, rExt, rIsolant, angleCoude, nbSegments, showTole }) {
  const angleTotalRad = (angleCoude * Math.PI) / 180;
  const r = showTole ? rExt : rIsolant;
  const circ = 2 * Math.PI * r;
  const overlap = showTole ? 30 : 0;
  const totalWidth = circ + overlap;

  const patrons = [];
  for (let s = 0; s < nbSegments; s++) {
    let beta;
    if ((s === 0 || s === nbSegments - 1) && nbSegments > 1) {
      beta = angleTotalRad / nbSegments / 2;
    } else {
      beta = nbSegments === 1 ? angleTotalRad : angleTotalRad / nbSegments;
    }

    const points = showTole
      ? patronPoisson(R, r, beta, 60, overlap)
      : patronLaine(R, r, beta, 60);

    const lMin = Math.min(...points.map(p => p.y));
    const lMax = Math.max(...points.map(p => p.y));
    const width = showTole ? totalWidth : circ;

    patrons.push({
      type: (s === 0 || s === nbSegments - 1) && nbSegments > 1 ? 'demi' : 'complet',
      points, lMin, lMax, width,
    });
  }

  const uniqueTypes = [];
  const demiPatrons = patrons.filter(p => p.type === 'demi');
  const completPatrons = patrons.filter(p => p.type === 'complet');
  if (demiPatrons.length > 0) uniqueTypes.push({ ...demiPatrons[0], count: demiPatrons.length, label: 'Demi-segment (extremites)' });
  if (completPatrons.length > 0) uniqueTypes.push({ ...completPatrons[0], count: completPatrons.length, label: 'Segment complet' });

  return (
    <div className="space-y-3">
      {uniqueTypes.map((patron, idx) => {
        const { points, width, lMax, lMin, count } = patron;
        const margin = 15;
        const svgW = 320;
        const scaleX = (svgW - 2 * margin) / width;
        const scaleY = (svgW * 0.55 - 2 * margin) / (lMax - lMin || 1);
        const sc = Math.min(scaleX, scaleY);
        const svgH = (lMax - lMin) * sc + 2 * margin + 35;

        const topPoints = points.map(p => ({
          x: margin + p.x * sc,
          y: margin + (p.y - lMin) * sc,
        }));
        const bottomY = margin;
        let pathD = `M${topPoints[0].x},${bottomY}`;
        pathD += ` L${topPoints[topPoints.length - 1].x},${bottomY}`;
        for (let i = topPoints.length - 1; i >= 0; i--) {
          pathD += ` L${topPoints[i].x},${topPoints[i].y}`;
        }
        pathD += 'Z';

        const widthMm = Math.round(width);
        const heightMaxMm = Math.round(lMax);
        const heightMinMm = Math.round(lMin);

        return (
          <div key={idx}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold" style={{ color: '#1d1d1f' }}>{patron.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: 'rgba(242,169,0,0.12)', color: '#c88800' }}>
                x{count}
              </span>
            </div>

            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full rounded-lg">
              <SharedDefs />
              <SvgGrid width={svgW} height={svgH} />
              <path d={pathD} fill={getFill(showTole)} stroke={getStroke(showTole)} strokeWidth="2" />
              {!showTole && (
                <>
                  <path d={pathD} fill={getHatchFill(showTole)} />
                  <path d={pathD} fill={getHatchFill2(showTole)} />
                </>
              )}

              {/* Axe central */}
              <line
                x1={topPoints[0].x}
                y1={(bottomY + topPoints[Math.floor(topPoints.length / 2)].y) / 2}
                x2={topPoints[topPoints.length - 1].x}
                y2={(bottomY + topPoints[Math.floor(topPoints.length / 2)].y) / 2}
                stroke="#e65100" strokeWidth="0.8" strokeDasharray="4,3" />

              {/* Zone recouvrement */}
              {showTole && overlap > 0 && (
                <rect
                  x={margin + (circ) * sc}
                  y={bottomY}
                  width={overlap * sc}
                  height={topPoints[Math.floor(topPoints.length / 2)].y - bottomY}
                  fill={getOverlapFill(true)} stroke={getOverlapStroke()} strokeWidth="0.7" strokeDasharray="3,2" />
              )}

              {/* Cote largeur */}
              <CoteLine x1={margin} y1={svgH - 14} x2={margin + width * sc} y2={svgH - 14}
                label={showTole ? `${widthMm} mm (circ + ${overlap}mm recouvr.)` : `${widthMm} mm`}
                color={showTole ? '#1565c0' : '#b45309'} />

              {/* Cote hauteur max */}
              <CoteLine x1={svgW - 8} y1={bottomY} x2={svgW - 8}
                y2={topPoints[Math.floor(topPoints.length / 2)].y}
                label={`max ${heightMaxMm}mm`} color="#c62828" side="right" />

              <ScaleBar x={margin} y={svgH - 2} scalePixPerMm={sc} barMm={50} />
            </svg>

            <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[10px]">
              <div className="glass-card !rounded-lg !p-1.5 text-center !shadow-none">
                <div className="text-[9px] text-gray-400 uppercase tracking-wide">Largeur</div>
                <div className="font-bold" style={{ color: showTole ? '#1565c0' : '#b45309' }}>{widthMm} mm</div>
              </div>
              <div className="glass-card !rounded-lg !p-1.5 text-center !shadow-none">
                <div className="text-[9px] text-gray-400 uppercase tracking-wide">H. max</div>
                <div className="font-bold text-red-600">{heightMaxMm} mm</div>
              </div>
              <div className="glass-card !rounded-lg !p-1.5 text-center !shadow-none">
                <div className="text-[9px] text-gray-400 uppercase tracking-wide">H. min</div>
                <div className="font-bold" style={{ color: '#ea580c' }}>{heightMinMm} mm</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PATRON REDUCTION (Secteur d'anneau)
   ═══════════════════════════════════════════════ */
function PatronReductionSVG({ data, showTole }) {
  const section = showTole ? data.tole : data.laine;

  if (!section.type || section.type !== 'cone') {
    return <PatronDroitSVG tole={data.tole} laine={data.laine} showTole={showTole} />;
  }

  const { Rgrand, Rpetit, angleSecteurDeg, generatrice, points } = section;
  const overlap = showTole ? (section.overlap || 30) : 0;

  const allX = points.map(p => p.x);
  const allY = points.map(p => p.y);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const margin = 30;
  const svgW = 320;
  const scX = (svgW - 2 * margin) / rangeX;
  const scY = (svgW * 0.7 - 2 * margin) / rangeY;
  const sc = Math.min(scX, scY);
  const svgH = rangeY * sc + 2 * margin + 25;

  const extPoints = points.filter(p => p.arc === 'ext');
  const intPoints = points.filter(p => p.arc === 'int');

  let pathD = '';
  extPoints.forEach((p, i) => {
    const px = margin + (p.x - minX) * sc;
    const py = margin + (p.y - minY) * sc;
    pathD += i === 0 ? `M${px},${py}` : ` L${px},${py}`;
  });
  intPoints.forEach((p) => {
    const px = margin + (p.x - minX) * sc;
    const py = margin + (p.y - minY) * sc;
    pathD += ` L${px},${py}`;
  });
  pathD += 'Z';

  return (
    <div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full rounded-lg">
        <SharedDefs />
        <SvgGrid width={svgW} height={svgH} />
        <path d={pathD} fill={getFill(showTole)} stroke={getStroke(showTole)} strokeWidth="2" />
        {!showTole && (
          <>
            <path d={pathD} fill={getHatchFill(showTole)} />
            <path d={pathD} fill={getHatchFill2(showTole)} />
          </>
        )}
        <ScaleBar x={margin} y={svgH - 2} scalePixPerMm={sc} barMm={100} />
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        {[
          { label: 'R grand', val: `${Rgrand} mm` },
          { label: 'R petit', val: `${Rpetit} mm` },
          { label: 'Angle secteur', val: `${angleSecteurDeg}\u00b0` },
          { label: 'Generatrice', val: `${generatrice} mm` },
        ].map(item => (
          <div key={item.label} className="glass-card !rounded-lg !p-1.5 text-center !shadow-none">
            <div className="text-[9px] text-gray-400 uppercase tracking-wide">{item.label}</div>
            <div className="font-bold" style={{ color: showTole ? '#1565c0' : '#b45309' }}>{item.val}</div>
          </div>
        ))}
      </div>
      {showTole && overlap > 0 && (
        <div className="mt-1 text-[10px] text-gray-400 text-center">
          + {overlap} mm de recouvrement sur l'arc exterieur
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PATRON TE (Selle de cheval)
   ═══════════════════════════════════════════════ */
function PatronTeSVG({ data, showTole }) {
  const piquage = showTole ? data.piquage.tole : data.piquage.laine;
  const { largeur, hauteurDroite, hauteurCourbure, courbe, developpee } = piquage;

  const totalHeight = hauteurDroite + hauteurCourbure;
  const margin = 25;
  const svgW = 320;
  const scX = (svgW - 2 * margin) / largeur;
  const scY = (svgW * 0.6 - 2 * margin) / totalHeight;
  const sc = Math.min(scX, scY);
  const drawW = largeur * sc;
  const drawH = totalHeight * sc;
  const svgH = drawH + 2 * margin + 25;

  const topY = margin;
  const baseY = margin + hauteurDroite * sc;

  let pathD = `M${margin},${topY}`;
  pathD += ` L${margin + drawW},${topY}`;
  const lastCurveY = baseY + courbe[courbe.length - 1].y * sc;
  pathD += ` L${margin + drawW},${lastCurveY}`;
  for (let i = courbe.length - 1; i >= 0; i--) {
    const px = margin + (i / (courbe.length - 1)) * drawW;
    const py = baseY + courbe[i].y * sc;
    pathD += ` L${px},${py}`;
  }
  pathD += 'Z';

  return (
    <div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full rounded-lg">
        <SharedDefs />
        <SvgGrid width={svgW} height={svgH} />
        <path d={pathD} fill={getFill(showTole)} stroke={getStroke(showTole)} strokeWidth="2" />
        {!showTole && (
          <>
            <path d={pathD} fill={getHatchFill(showTole)} />
            <path d={pathD} fill={getHatchFill2(showTole)} />
          </>
        )}

        {/* Ligne de base (hauteur droite) */}
        <line x1={margin} y1={baseY} x2={margin + drawW} y2={baseY}
          stroke="#e65100" strokeWidth="0.8" strokeDasharray="4,3" />

        {/* Cote largeur */}
        <CoteLine x1={margin} y1={svgH - 14} x2={margin + drawW} y2={svgH - 14}
          label={`${largeur} mm`}
          color={showTole ? '#1565c0' : '#b45309'} />

        {/* Cote hauteur droite */}
        <CoteLine x1={svgW - 10} y1={topY} x2={svgW - 10} y2={baseY}
          label={`${hauteurDroite} mm`} color="#c62828" side="right" />

        <ScaleBar x={margin} y={svgH - 2} scalePixPerMm={sc} barMm={50} />
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
        <div className="glass-card !rounded-lg !p-1.5 text-center !shadow-none">
          <div className="text-[9px] text-gray-400 uppercase tracking-wide">Developpee</div>
          <div className="font-bold" style={{ color: showTole ? '#1565c0' : '#b45309' }}>{developpee} mm</div>
        </div>
        <div className="glass-card !rounded-lg !p-1.5 text-center !shadow-none">
          <div className="text-[9px] text-gray-400 uppercase tracking-wide">H. droite</div>
          <div className="font-bold text-red-600">{hauteurDroite} mm</div>
        </div>
        <div className="glass-card !rounded-lg !p-1.5 text-center !shadow-none">
          <div className="text-[9px] text-gray-400 uppercase tracking-wide">Courbure</div>
          <div className="font-bold" style={{ color: '#ea580c' }}>{hauteurCourbure} mm</div>
        </div>
      </div>

      {/* Info trou collecteur */}
      {showTole && data.collecteur && (
        <div className="mt-2 text-[10px] rounded-lg p-2 text-gray-600"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <strong>Trou dans le collecteur :</strong> diam. {data.collecteur.trouDiamTole} mm
          <br />{data.collecteur.note}
        </div>
      )}
      {!showTole && data.collecteur && (
        <div className="mt-2 text-[10px] rounded-lg p-2 text-gray-600"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <strong>Trou laine collecteur :</strong> diam. {data.collecteur.trouDiamLaine} mm
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SECTION WRAPPER (Tole ou Laine)
   ═══════════════════════════════════════════════ */
function PatronSection({ title, showTole, children, insulType }) {
  const borderColor = showTole ? 'rgba(37,99,235,0.15)' : 'rgba(245,158,11,0.15)';
  const bgColor = showTole ? 'rgba(37,99,235,0.03)' : 'rgba(245,158,11,0.03)';
  const iconColor = showTole ? '#2563eb' : '#b45309';

  return (
    <div className="rounded-xl p-3" style={{ background: bgColor, border: `1px solid ${borderColor}` }}>
      <h5 className="text-[11px] font-bold flex items-center gap-2 mb-2" style={{ color: '#1d1d1f' }}>
        <span className="w-5 h-5 rounded flex items-center justify-center"
          style={{ background: showTole ? 'rgba(37,99,235,0.1)' : 'rgba(245,158,11,0.1)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
            {showTole ? (
              <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>
            ) : (
              <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /></>
            )}
          </svg>
        </span>
        {title}
      </h5>
      {children}
      {!showTole && (
        <div className="mt-2 text-[9px] text-gray-400 italic">
          {insulType === 'coquille'
            ? 'Coquilles pre-formees, maintenues par ligatures fil galva'
            : 'Maintenir avec grillage metallique galva maille 25x25mm'}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ═══════════════════════════════════════════════ */
export default function PatronsDecoupe({ pieces, params, getDnAtIndex, darkMode }) {
  const [currentPiece, setCurrentPiece] = useState(0);
  const printRef = useRef(null);

  if (!pieces || !pieces.length) {
    return (
      <div className="text-center py-12">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
        <p className="text-sm font-semibold" style={{ color: '#1d1d1f' }}>Aucune piece dans la ligne</p>
        <p className="text-[11px] mt-1 text-gray-400">Ajoutez des pieces pour generer les patrons de decoupe</p>
      </div>
    );
  }

  const { dnDepart, epIsolant, epTole, rayonFacteur, typeTole } = params;
  const toleInfo = TYPES_TOLE.find(t => t.id === typeTole) || TYPES_TOLE[0];
  const total = pieces.length;

  // Clamp current piece index
  const idx = Math.max(0, Math.min(currentPiece, total - 1));

  // Build patron data for a given piece index
  function buildPatronData(index) {
    const piece = pieces[index];
    const dn = getDnAtIndex(index);
    const De = DN_TABLE[dn] || 114.3;

    switch (piece.type) {
      case 'droit': {
        const longueur = piece.longueur || 1000;
        return { kind: 'droit', result: patronDroit(De, epIsolant, epTole, longueur) };
      }
      case 'coude90':
      case 'casse': {
        const R = rayonCintrage(dn, rayonFacteur);
        const rTuyau = De / 2;
        const rIsolant = rTuyau + epIsolant;
        const rTole = rIsolant + epTole;
        const nbSeg = piece.nbSegments || 4;
        const angle = piece.type === 'coude90' ? 90 : 45;
        return { kind: 'coude', R, rTole, rIsolant, angle, nbSeg };
      }
      case 'reduction': {
        const De2 = DN_TABLE[piece.dnSortie] || De;
        const longueur = piece.longueur || Math.abs(De - De2) * 2 || 200;
        return { kind: 'reduction', result: patronReduction(De, De2, longueur, epIsolant, epTole) };
      }
      case 'te': {
        const DePiquage = DN_TABLE[piece.dnPiquage || dn] || De;
        return { kind: 'te', result: patronTe(De, DePiquage, epIsolant, epTole) };
      }
      case 'piquage': {
        const DeSortie = DN_TABLE[piece.dnSortie] || De;
        const DePiquage = DN_TABLE[piece.dnPiquage] || De;
        return { kind: 'piquage', result: patronPiquage(De, DeSortie, DePiquage, epIsolant, epTole) };
      }
      default:
        return null;
    }
  }

  // Render patron content for a given data/showTole
  function renderPatron(patronData, showTole) {
    if (!patronData) return null;
    switch (patronData.kind) {
      case 'droit':
        return <PatronDroitSVG tole={patronData.result.tole} laine={patronData.result.laine} showTole={showTole} />;
      case 'coude':
        return <PatronCoudeSVG R={patronData.R} rExt={patronData.rTole} rIsolant={patronData.rIsolant}
          angleCoude={patronData.angle} nbSegments={patronData.nbSeg} showTole={showTole} />;
      case 'reduction':
        return <PatronReductionSVG data={patronData.result} showTole={showTole} />;
      case 'te':
        return <PatronTeSVG data={patronData.result} showTole={showTole} />;
      case 'piquage':
        return <PatronTeSVG data={patronData.result} showTole={showTole} />;
      default:
        return null;
    }
  }

  // Render a single piece card
  function renderPieceCard(index, forPrint = false) {
    const piece = pieces[index];
    const dn = getDnAtIndex(index);
    const De = DN_TABLE[dn] || 114.3;
    const typeInfo = TYPE_COLORS[piece.type] || TYPE_COLORS.droit;
    const patronData = buildPatronData(index);
    const pieceInsulType = getInsulationType(dn);
    if (!patronData) return null;

    // For coquille + straight pipe: no laine patron needed (pre-formed)
    const skipLainePatron = pieceInsulType === 'coquille' && patronData.kind === 'droit';
    const nbCoq = skipLainePatron ? getNbCoquilles(piece.longueur || 1000) : 0;

    return (
      <div key={piece.id || index}
        className={`glass-card overflow-hidden ${forPrint ? 'print-piece-card' : ''}`}
        style={forPrint ? { breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: 16 } : {}}>

        {/* En-tete piece */}
        <div className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <span className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
            style={{ background: typeInfo.bg }}>
            P{index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold" style={{ color: typeInfo.text }}>
              Piece N\u00b0 {index + 1} — {typeInfo.label} — DN {dn}
            </div>
            <div className="text-[10px] text-gray-400">
              De {De}mm
              {piece.type === 'droit' && ` \u2022 L ${piece.longueur || 1000}mm`}
              {(piece.type === 'coude90' || piece.type === 'casse') && ` \u2022 ${piece.nbSegments || 4} segments`}
              {piece.type === 'reduction' && piece.dnSortie && ` \u2022 vers DN${piece.dnSortie}`}
              {piece.type === 'te' && piece.dnPiquage && ` \u2022 Piquage DN${piece.dnPiquage}`}
              {piece.type === 'piquage' && ` \u2022 Sortie DN${piece.dnSortie} \u2022 Piq DN${piece.dnPiquage}`}
              {` \u2022 ${pieceInsulType === 'coquille' ? 'Coquille' : 'Matelas'}`}
            </div>
          </div>
        </div>

        {/* Patrons cote a cote */}
        <div className="p-3">
          <div className="grid grid-cols-2 gap-3">
            <PatronSection title={`Tole ${toleInfo.label} ${epTole}mm`} showTole={true} insulType={pieceInsulType}>
              {renderPatron(patronData, true)}
            </PatronSection>
            {skipLainePatron ? (
              /* Coquille pre-formee : pas de patron isolant a decouper */
              <PatronSection title="Isolant (coquille)" showTole={false} insulType={pieceInsulType}>
                <div className="text-center py-6">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(22,163,74,0.1)' }}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-[11px] font-semibold" style={{ color: '#16a34a' }}>Coquille pre-formee</p>
                  <p className="text-[10px] text-gray-400 mt-1">Pas de decoupe necessaire</p>
                  <div className="mt-3 rounded-lg p-2" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.15)' }}>
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">Quantite</div>
                    <div className="text-sm font-bold" style={{ color: '#16a34a' }}>{nbCoq} coquille{nbCoq > 1 ? 's' : ''}</div>
                    <div className="text-[9px] text-gray-400">{nbCoq * 2} demi-coquilles (L=1000mm)</div>
                  </div>
                </div>
              </PatronSection>
            ) : (
              <PatronSection title={pieceInsulType === 'coquille' ? 'Isolant (decoupe)' : 'Laine de verre'} showTole={false} insulType={pieceInsulType}>
                {renderPatron(patronData, false)}
              </PatronSection>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const piece = pieces[idx];
  const dn = getDnAtIndex(idx);
  const typeInfo = TYPE_COLORS[piece?.type] || TYPE_COLORS.droit;

  return (
    <div className="space-y-4">
      {/* ─── Print styles (injected inline) ─── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .print-piece-card { page-break-after: always; break-after: page; }
          .print-piece-card:last-child { page-break-after: avoid; break-after: avoid; }
          .no-print { display: none !important; }
          .glass-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
        }
      `}</style>

      {/* ─── Navigation entre pieces ─── */}
      <div className="no-print glass-card !p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
              style={{ background: typeInfo.bg }}>
              P{idx + 1}
            </span>
            <div>
              <div className="text-[11px] font-bold" style={{ color: '#1d1d1f' }}>
                Piece {idx + 1} sur {total}
              </div>
              <div className="text-[10px] text-gray-400">
                {typeInfo.label} — DN {dn}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setCurrentPiece(Math.max(0, idx - 1))}
              disabled={idx === 0}
              className="glass-button !px-2.5 !py-1.5 !text-[10px] !font-semibold"
              style={{ opacity: idx === 0 ? 0.3 : 1 }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Prec.
            </button>
            <button onClick={() => setCurrentPiece(Math.min(total - 1, idx + 1))}
              disabled={idx === total - 1}
              className="glass-button !px-2.5 !py-1.5 !text-[10px] !font-semibold"
              style={{ opacity: idx === total - 1 ? 0.3 : 1 }}>
              Suiv.
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Piece selector pills */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {pieces.map((p, i) => {
            const ti = TYPE_COLORS[p.type] || TYPE_COLORS.droit;
            return (
              <button key={p.id || i} onClick={() => setCurrentPiece(i)}
                className="flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all"
                style={{
                  background: i === idx ? ti.bg : 'rgba(0,0,0,0.04)',
                  color: i === idx ? '#fff' : '#86868b',
                  transform: i === idx ? 'scale(1.05)' : 'scale(1)',
                }}>
                P{i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Current piece card (interactive view) ─── */}
      <div className="no-print">
        {renderPieceCard(idx)}
      </div>

      {/* ─── Print button ─── */}
      <button onClick={handlePrint}
        className="no-print glass-button gold w-full !py-3 !font-semibold !text-sm flex items-center justify-center gap-2"
        style={{ color: '#c88800' }}>
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
        </svg>
        Imprimer les patrons
      </button>

      {/* ─── Hidden print area with all pieces ─── */}
      <div ref={printRef} className="print-area hidden print:block">
        <div className="text-center mb-4" style={{ borderBottom: '2px solid #F2A900', paddingBottom: 8 }}>
          <h2 className="text-base font-bold" style={{ color: '#1d1d1f' }}>Patrons de decoupe — Calorifuge</h2>
          <p className="text-[10px] text-gray-400 mt-1">
            DN{params.dnDepart} \u2022 {getInsulationType(params.dnDepart) === 'coquille' ? 'Coquille' : 'Matelas laine'} {params.epIsolant}mm \u2022 Tole {toleInfo.label} {params.epTole}mm \u2022 {new Date().toLocaleDateString('fr-FR')}
          </p>
        </div>
        {pieces.map((_, i) => renderPieceCard(i, true))}
      </div>
    </div>
  );
}
