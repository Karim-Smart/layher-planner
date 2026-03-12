import { useState, useMemo } from 'react';
import { DN_TABLE, MATERIAUX_ISOLANTS } from '../../utils/calculs';
import { calcRecapLigne, TYPES_TOLE, getInsulationType } from '../../utils/calculs-ligne';

/* ─── Configuration par type de piece ─── */
const TYPE_LABELS = {
  droit:     { label: 'Tuyau droit', icon: '\u2500', badgeBg: '#3b82f6', badgeText: '#fff' },
  coude90:   { label: 'Coude 90\u00b0', icon: '\u256e', badgeBg: '#f97316', badgeText: '#fff' },
  casse:     { label: 'Cassé', icon: '\u2572', badgeBg: '#f59e0b', badgeText: '#fff' },
  reduction: { label: 'Reduction', icon: '\u25b7', badgeBg: '#8b5cf6', badgeText: '#fff' },
  te:        { label: 'Te', icon: '\u252c', badgeBg: '#22c55e', badgeText: '#fff' },
  piquage:   { label: 'Piquage', icon: '\u2534', badgeBg: '#ec4899', badgeText: '#fff' },
};

/* ─── Categories d'accessoires ─── */
const ACCESSOIRE_CATEGORIES = {
  fixation: {
    label: 'Fixation',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93" />
      </svg>
    ),
  },
  etancheite: {
    label: 'Etancheite',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 20h16M4 20V10l8-8 8 8v10" /><rect x="9" y="14" width="6" height="6" />
      </svg>
    ),
  },
  maintien: {
    label: 'Maintien isolant',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
  },
};

function getDimensions(piece) {
  switch (piece.type) {
    case 'droit': return `L=${piece.longueur || 1000}mm`;
    case 'coude90': return `${piece.nbSegments || 4} seg.`;
    case 'casse': return `${piece.nbSegments || 3} seg.`;
    case 'reduction': return `\u2192DN${piece.dnSortie}`;
    case 'te': return `Piq DN${piece.dnPiquage}`;
    case 'piquage': return `\u2192DN${piece.dnSortie} / Piq DN${piece.dnPiquage}`;
    default: return '-';
  }
}

/* ─── Utilitaire arrondi ─── */
function round(val, dec) {
  const f = 10 ** dec;
  return Math.round(val * f) / f;
}

/* ═══════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ═══════════════════════════════════════════════ */
export default function RecapLigne({ pieces, params, getDnAtIndex, darkMode }) {
  const [copieOk, setCopieOk] = useState(false);
  const [sortKey, setSortKey] = useState(null); // null | 'type' | 'dn' | 'surfTole' | 'surfLaine'
  const [sortAsc, setSortAsc] = useState(true);

  if (!pieces || pieces.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="#86868b" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
        </svg>
        <p className="text-sm font-semibold" style={{ color: '#1d1d1f' }}>Ajoutez des pieces dans l'editeur</p>
      </div>
    );
  }

  const recap = calcRecapLigne(pieces, params);
  const toleInfo = recap.toleInfo || TYPES_TOLE[0];
  const insulType = getInsulationType(params.dnDepart);

  // Longueur totale de la ligne
  const longueurTotale = pieces.reduce((acc, p) => {
    if (p.type === 'droit') return acc + (p.longueur || 1000);
    if (p.type === 'reduction') return acc + (p.longueur || 300);
    return acc;
  }, 0);

  // Comptage par type
  const comptage = {};
  for (const p of pieces) {
    comptage[p.type] = (comptage[p.type] || 0) + 1;
  }

  // Poids isolant (laine de verre, densite = 48 kg/m3)
  const densiteLaine = MATERIAUX_ISOLANTS['Laine de verre']?.densite || 48;
  // Volume isolant approximatif : surface laine * epaisseur isolant
  const volumeIsolant = recap.totalSurfLaine * (params.epIsolant / 1000); // m3
  const poidsIsolant = round(volumeIsolant * densiteLaine, 2);
  const poidsTotalKg = round(recap.poidsTole + poidsIsolant, 2);
  const longueurTotaleM = longueurTotale / 1000;
  const poidsParMetre = longueurTotaleM > 0 ? round(poidsTotalKg / longueurTotaleM, 2) : 0;

  // Sorted detail pieces
  const sortedPieces = useMemo(() => {
    if (!sortKey) return recap.detailPieces.map((p, i) => ({ ...p, _idx: i }));
    const arr = recap.detailPieces.map((p, i) => ({ ...p, _idx: i }));
    arr.sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case 'type': va = a.type; vb = b.type; break;
        case 'dn': va = a.dn; vb = b.dn; break;
        case 'surfTole': va = a.surfTole; vb = b.surfTole; break;
        case 'surfLaine': va = a.surfLaine; vb = b.surfLaine; break;
        default: return 0;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [recap.detailPieces, sortKey, sortAsc]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span className="text-gray-300 ml-0.5">\u2195</span>;
    return <span className="ml-0.5" style={{ color: '#F2A900' }}>{sortAsc ? '\u2191' : '\u2193'}</span>;
  }

  // Accessoires groupes
  const accessoires = [
    { cat: 'fixation', label: 'Rivets pop inox', qty: recap.nbRivets, unit: 'pcs' },
    { cat: 'etancheite', label: 'Bande alu adhesive', qty: recap.longueurBandeAlu, unit: 'm' },
    ...(insulType === 'matelas' ? [
      { cat: 'maintien', label: 'Ligatures fil galva', qty: recap.nbLigatures, unit: 'pcs' },
      { cat: 'maintien', label: 'Grillage galva 25x25', qty: recap.totalSurfLaine, unit: 'm\u00b2' },
    ] : [
      { cat: 'maintien', label: 'Coquilles isolantes', qty: recap.totalCoquilles, unit: 'pcs' },
      { cat: 'maintien', label: 'Demi-coquilles', qty: recap.totalCoquilles * 2, unit: 'pcs' },
      { cat: 'maintien', label: 'Ligatures fil galva', qty: recap.nbLigatures, unit: 'pcs' },
    ]),
  ];

  const accessoiresByGroup = {};
  for (const a of accessoires) {
    if (!accessoiresByGroup[a.cat]) accessoiresByGroup[a.cat] = [];
    accessoiresByGroup[a.cat].push(a);
  }

  const copierResume = () => {
    const now = new Date();
    const timestamp = `${now.toLocaleDateString('fr-FR')} a ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    const lignes = [
      '\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550',
      '     RECAPITULATIF LIGNE CALORIFUGE',
      '\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550',
      '',
      `Date: ${timestamp}`,
      `DN depart: DN${params.dnDepart} (Oe ${DN_TABLE[params.dnDepart]}mm)`,
      `Isolant: ${params.epIsolant}mm ${insulType === 'coquille' ? 'coquilles' : 'laine de verre'}`,
      `Tole: ${toleInfo.label} ${params.epTole}mm`,
      `Rayon coude: ${params.rayonFacteur}x DN`,
      '',
      `Longueur totale: ${longueurTotaleM.toFixed(1)} m`,
      `Nb pieces: ${pieces.length} (${Object.entries(comptage).map(([t, n]) => `${n} ${TYPE_LABELS[t]?.label || t}`).join(', ')})`,
      '',
      '\u2500\u2500 Detail pieces \u2500\u2500',
      ...recap.detailPieces.map((p, i) => {
        const info = TYPE_LABELS[p.type] || { label: p.type };
        return `P${i + 1}: ${info.label} | DN${p.dn} | ${getDimensions(p)} | Tole: ${p.surfTole}m\u00b2 | Laine: ${p.surfLaine}m\u00b2`;
      }),
      '',
      '\u2500\u2500 Totaux \u2500\u2500',
      `Surface tole ${toleInfo.label}: ${recap.totalSurfTole} m\u00b2`,
      `Surface ${insulType === 'coquille' ? 'coquille' : 'laine de verre'}: ${recap.totalSurfLaine} m\u00b2`,
      ...(insulType === 'coquille' ? [`Nb coquilles: ${recap.totalCoquilles} (${recap.totalCoquilles * 2} demi-coquilles)`] : []),
      `Poids tole: ${recap.poidsTole} kg`,
      `Poids isolant: ${poidsIsolant} kg`,
      `Poids total: ${poidsTotalKg} kg`,
      `Poids par metre: ${poidsParMetre} kg/m`,
      '',
      '\u2500\u2500 Accessoires \u2500\u2500',
      `Rivets pop inox: ${recap.nbRivets}`,
      `Bande alu adhesive: ${recap.longueurBandeAlu} m`,
      `Ligatures fil galva: ${recap.nbLigatures}`,
      ...(insulType === 'coquille'
        ? [`Coquilles isolantes: ${recap.totalCoquilles} (${recap.totalCoquilles * 2} demi-coquilles)`]
        : [`Grillage metallique galva maille 25x25mm: ${recap.totalSurfLaine} m\u00b2`]),
      '',
      '\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550',
    ];

    navigator.clipboard.writeText(lignes.join('\n')).then(() => {
      setCopieOk(true);
      setTimeout(() => setCopieOk(false), 2000);
    });
  };

  return (
    <div className="space-y-4">
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .recap-print-area, .recap-print-area * { visibility: visible !important; }
          .recap-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .glass-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
        }
      `}</style>

      {/* ═══════ 4 Summary Cards ═══════ */}
      <div className="grid grid-cols-2 gap-2">
        {/* Total pieces */}
        <div className="glass-card !p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(242,169,0,0.1)' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#F2A900" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-bold" style={{ color: '#1d1d1f' }}>{pieces.length}</div>
            <div className="text-[10px] text-gray-400 -mt-0.5">Total pieces</div>
          </div>
        </div>

        {/* Longueur totale */}
        <div className="glass-card !p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(37,99,235,0.08)' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
              <path d="M2 12h20M6 8l-4 4 4 4M18 8l4 4-4 4" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-bold" style={{ color: '#1d1d1f' }}>{longueurTotaleM.toFixed(1)}<span className="text-xs font-normal text-gray-400 ml-0.5">m</span></div>
            <div className="text-[10px] text-gray-400 -mt-0.5">Longueur totale</div>
          </div>
        </div>

        {/* Surface tole */}
        <div className="glass-card !p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(100,116,139,0.08)' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-bold" style={{ color: '#1d1d1f' }}>{recap.totalSurfTole}<span className="text-xs font-normal text-gray-400 ml-0.5">m\u00b2</span></div>
            <div className="text-[10px] text-gray-400 -mt-0.5">Tole {toleInfo.label}</div>
          </div>
        </div>

        {/* Surface isolant */}
        <div className="glass-card !p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: insulType === 'coquille' ? 'rgba(22,163,74,0.08)' : 'rgba(245,158,11,0.08)' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={insulType === 'coquille' ? '#16a34a' : '#f59e0b'} strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-bold" style={{ color: '#1d1d1f' }}>
              {insulType === 'coquille' ? recap.totalCoquilles : recap.totalSurfLaine}
              <span className="text-xs font-normal text-gray-400 ml-0.5">{insulType === 'coquille' ? 'coq.' : 'm\u00b2'}</span>
            </div>
            <div className="text-[10px] text-gray-400 -mt-0.5">{insulType === 'coquille' ? 'Coquilles' : 'Surface laine'}</div>
          </div>
        </div>
      </div>

      {/* ═══════ Comptage par type ═══════ */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(comptage).map(([type, count]) => {
          const info = TYPE_LABELS[type];
          return (
            <span key={type} className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: info?.badgeBg + '15', color: info?.badgeBg }}>
              <span style={{ opacity: 0.6 }}>{info?.icon}</span>
              {count}x {info?.label || type}
            </span>
          );
        })}
      </div>

      {/* ═══════ Tableau des pieces ═══════ */}
      <div className="glass-card overflow-hidden !p-0 recap-print-area">
        {/* Print header (hidden on screen) */}
        <div className="hidden print:block p-3" style={{ borderBottom: '2px solid #F2A900' }}>
          <h2 className="text-sm font-bold" style={{ color: '#1d1d1f' }}>Recapitulatif ligne calorifuge</h2>
          <p className="text-[10px] text-gray-400">
            DN{params.dnDepart} \u2022 {insulType === 'coquille' ? 'Coquille' : 'Matelas laine'} {params.epIsolant}mm \u2022 Tole {toleInfo.label} {params.epTole}mm \u2022 {new Date().toLocaleDateString('fr-FR')} {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ background: '#1d1d1f' }}>
                <th className="px-2 py-2 text-left text-white font-semibold text-[10px]">N\u00b0</th>
                <th className="px-2 py-2 text-left text-white font-semibold text-[10px] cursor-pointer select-none"
                  onClick={() => handleSort('type')}>
                  Type <SortIcon col="type" />
                </th>
                <th className="px-2 py-2 text-center text-white font-semibold text-[10px] cursor-pointer select-none"
                  onClick={() => handleSort('dn')}>
                  DN <SortIcon col="dn" />
                </th>
                <th className="px-2 py-2 text-left text-white font-semibold text-[10px]">Dim.</th>
                <th className="px-2 py-2 text-right text-white font-semibold text-[10px] cursor-pointer select-none"
                  onClick={() => handleSort('surfTole')}>
                  Tole <SortIcon col="surfTole" />
                </th>
                <th className="px-2 py-2 text-right text-white font-semibold text-[10px] cursor-pointer select-none"
                  onClick={() => handleSort('surfLaine')}>
                  {insulType === 'coquille' ? 'Coquille' : 'Laine'} <SortIcon col="surfLaine" />
                </th>
                {insulType === 'coquille' && (
                  <th className="px-2 py-2 text-right text-white font-semibold text-[10px]">
                    Nb coq.
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedPieces.map((p, i) => {
                const info = TYPE_LABELS[p.type] || { label: p.type, icon: '?', badgeBg: '#6b7280' };
                return (
                  <tr key={p.id || p._idx}
                    style={{
                      background: i % 2 === 0 ? '#ffffff' : '#fafafa',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(242,169,0,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#ffffff' : '#fafafa'}>
                    <td className="px-2 py-1.5 font-bold text-gray-400">P{p._idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: info.badgeBg + '18', color: info.badgeBg }}>
                        <span style={{ opacity: 0.5 }}>{info.icon}</span>
                        {info.label}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-gray-500">DN{p.dn}</td>
                    <td className="px-2 py-1.5 text-gray-400">{getDimensions(p)}</td>
                    <td className="px-2 py-1.5 text-right font-mono" style={{ color: '#64748b' }}>{p.surfTole}</td>
                    <td className="px-2 py-1.5 text-right font-mono" style={{ color: '#b45309' }}>{p.surfLaine}</td>
                    {insulType === 'coquille' && (
                      <td className="px-2 py-1.5 text-right font-mono" style={{ color: '#16a34a' }}>
                        {p.nbCoquilles ? `${p.nbCoquilles} (${p.nbCoquilles * 2}\u00bd)` : '-'}
                      </td>
                    )}
                  </tr>
                );
              })}

              {/* Total row */}
              <tr style={{ background: 'rgba(242,169,0,0.08)', borderTop: '2px solid #F2A900' }}>
                <td colSpan={4} className="px-2 py-2 text-right font-bold text-[11px]" style={{ color: '#F2A900' }}>
                  TOTAL
                </td>
                <td className="px-2 py-2 text-right font-bold font-mono text-[11px]" style={{ color: '#F2A900' }}>
                  {recap.totalSurfTole} m\u00b2
                </td>
                <td className="px-2 py-2 text-right font-bold font-mono text-[11px]" style={{ color: '#F2A900' }}>
                  {recap.totalSurfLaine} m\u00b2
                </td>
                {insulType === 'coquille' && (
                  <td className="px-2 py-2 text-right font-bold font-mono text-[11px]" style={{ color: '#16a34a' }}>
                    {recap.totalCoquilles} coq.
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════ Poids ═══════ */}
      <div className="glass-card !p-3">
        <h4 className="text-[11px] font-bold flex items-center gap-2 mb-2.5" style={{ color: '#1d1d1f' }}>
          <span className="w-5 h-5 rounded flex items-center justify-center"
            style={{ background: 'rgba(242,169,0,0.1)' }}>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#F2A900" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </span>
          Poids estimes
        </h4>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(100,116,139,0.06)' }}>
            <div className="text-[9px] text-gray-400 uppercase tracking-wide">Tole {toleInfo.label}</div>
            <div className="text-sm font-bold" style={{ color: '#1d1d1f' }}>{recap.poidsTole} kg</div>
            <div className="text-[9px] text-gray-400">({toleInfo.densite} kg/m\u00b3)</div>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(245,158,11,0.06)' }}>
            <div className="text-[9px] text-gray-400 uppercase tracking-wide">{insulType === 'coquille' ? 'Coquilles' : 'Laine de verre'}</div>
            <div className="text-sm font-bold" style={{ color: '#1d1d1f' }}>{poidsIsolant} kg</div>
            <div className="text-[9px] text-gray-400">({densiteLaine} kg/m\u00b3)</div>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(242,169,0,0.06)', border: '1px solid rgba(242,169,0,0.15)' }}>
            <div className="text-[9px] uppercase tracking-wide" style={{ color: '#F2A900' }}>Poids total</div>
            <div className="text-sm font-bold" style={{ color: '#1d1d1f' }}>{poidsTotalKg} kg</div>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(37,99,235,0.04)' }}>
            <div className="text-[9px] text-gray-400 uppercase tracking-wide">Par metre</div>
            <div className="text-sm font-bold" style={{ color: '#1d1d1f' }}>{poidsParMetre} kg/m</div>
          </div>
        </div>
      </div>

      {/* ═══════ Accessoires groupes ═══════ */}
      <div className="glass-card !p-3">
        <h4 className="text-[11px] font-bold flex items-center gap-2 mb-2.5" style={{ color: '#1d1d1f' }}>
          <span className="w-5 h-5 rounded flex items-center justify-center"
            style={{ background: 'rgba(100,116,139,0.08)' }}>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
              <path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </span>
          Accessoires necessaires
        </h4>

        <div className="space-y-2.5">
          {Object.entries(accessoiresByGroup).map(([catKey, items]) => {
            const cat = ACCESSOIRE_CATEGORIES[catKey];
            return (
              <div key={catKey}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-gray-400">{cat?.icon}</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{cat?.label || catKey}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {items.map((a, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
                      style={{ background: 'rgba(0,0,0,0.025)' }}>
                      <span className="text-[10px] text-gray-500">{a.label}</span>
                      <span className="text-[11px] font-bold" style={{ color: '#1d1d1f' }}>
                        {a.qty} <span className="text-[9px] font-normal text-gray-400">{a.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════ Note methode de pose ═══════ */}
      <div className="rounded-xl p-3 text-[11px] flex items-start gap-2"
        style={{ background: 'rgba(242,169,0,0.05)', border: '1px solid rgba(242,169,0,0.12)', color: '#92400e' }}>
        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          <strong>Methode de pose :</strong> {insulType === 'coquille'
            ? `Coquilles isolantes pre-formees (2 demi-coquilles), maintenues par ligatures fil galva, puis couverture tole ${toleInfo.label} avec recouvrement 30mm, fixation par rivets pop inox et bande alu adhesive aux jonctions.`
            : `Laine de verre maintenue par grillage metallique galvanise maille 25x25mm, puis couverture tole ${toleInfo.label} avec recouvrement 30mm, fixation par rivets pop inox et bande alu adhesive aux jonctions.`}
        </span>
      </div>

      {/* ═══════ Boutons d'export ═══════ */}
      <div className="flex gap-2 no-print">
        <button onClick={copierResume}
          className="flex-1 glass-button !py-3 !font-semibold !text-[11px] flex items-center justify-center gap-2"
          style={{
            background: copieOk ? '#22c55e' : undefined,
            color: copieOk ? '#fff' : '#2563eb',
            borderColor: copieOk ? '#22c55e' : 'rgba(37,99,235,0.2)',
            transition: 'all 0.3s ease',
          }}>
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            {copieOk
              ? <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              : <><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" /><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" /></>
            }
          </svg>
          {copieOk ? 'Copie !' : 'Copier le resume'}
        </button>
        <button onClick={() => window.print()}
          className="flex-1 glass-button gold !py-3 !font-semibold !text-[11px] flex items-center justify-center gap-2"
          style={{ color: '#c88800' }}>
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
          </svg>
          Imprimer
        </button>
      </div>
    </div>
  );
}
