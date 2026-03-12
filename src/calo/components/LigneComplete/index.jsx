import { useState, useEffect, useMemo } from 'react';
import { DN_TABLE, DN_LIST } from '../../utils/calculs';
import { TYPES_TOLE, getInsulationType } from '../../utils/calculs-ligne';
import PieceEditor from './PieceEditor';
import VueSchema from './VueSchema';
import Vue3D from './Vue3D';
import PatronsDecoupe from './PatronsDecoupe';
import RecapLigne from './RecapLigne';

const EPAISSEURS_ISOLANT = [30, 40, 50, 60, 80, 100];
const EPAISSEUR_TOLE = [0.5, 0.6, 0.8, 1.0];

const SECTIONS = [
  { id: 'editeur', label: 'Editeur', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { id: 'schema', label: '2D', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z' },
  { id: '3d', label: '3D', icon: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9' },
  { id: 'patrons', label: 'Patrons', icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { id: 'recap', label: 'Recap', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
];

export default function LigneComplete() {
  const [params, setParams] = useState(() => {
    const saved = localStorage.getItem('calo_ligne_params');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration: ajouter typeTole si absent
      if (!parsed.typeTole) parsed.typeTole = 'isoxal';
      return parsed;
    }
    return {
      dnDepart: 100,
      epIsolant: 50,
      epTole: 0.8,
      typeTole: 'isoxal',
      rayonFacteur: 1.5,
    };
  });

  const [pieces, setPieces] = useState(() => {
    const saved = localStorage.getItem('calo_ligne_pieces');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeSection, setActiveSection] = useState('editeur');
  const [showParams, setShowParams] = useState(true);

  useEffect(() => {
    localStorage.setItem('calo_ligne_params', JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem('calo_ligne_pieces', JSON.stringify(pieces));
  }, [pieces]);

  // DN courant a chaque position (change apres reduction ou piquage)
  function getDnAtIndex(index) {
    let dn = params.dnDepart;
    for (let i = 0; i < index; i++) {
      if ((pieces[i]?.type === 'reduction' || pieces[i]?.type === 'piquage') && pieces[i]?.dnSortie) {
        dn = pieces[i].dnSortie;
      }
    }
    return dn;
  }

  // Stats rapides
  const stats = useMemo(() => {
    let longueur = 0;
    pieces.forEach(p => {
      if (p.type === 'droit') longueur += (p.longueur || 1000);
      if (p.type === 'reduction') longueur += (p.longueur || 300);
      if (p.type === 'te' || p.type === 'piquage') longueur += 200;
    });
    return {
      count: pieces.length,
      longueur: (longueur / 1000).toFixed(1),
      coudes: pieces.filter(p => p.type === 'coude90' || p.type === 'casse').length,
    };
  }, [pieces]);

  // Manipulation des pieces
  function ajouterPiece(type, overrides = {}) {
    const dnCourant = getDnAtIndex(pieces.length);
    const defaults = {
      droit: { longueur: 1000 },
      coude90: { nbSegments: 4 },
      casse: { nbSegments: 3 },
      reduction: { dnSortie: DN_LIST.find(d => d < dnCourant) || dnCourant, longueur: 300 },
      te: { dnPiquage: dnCourant, hauteurPiquage: 200 },
      piquage: { dnSortie: dnCourant, dnPiquage: Math.min(dnCourant, 50), hauteurPiquage: 150 },
    };
    setPieces(p => [...p, { id: Date.now() + Math.random(), type, orientation: 0, ...defaults[type], ...overrides }]);
  }

  function dupliquerPiece(id) {
    setPieces(p => {
      const original = p.find(piece => piece.id === id);
      if (!original) return p;
      const copie = { ...original, id: Date.now() + Math.random() };
      const idx = p.indexOf(original);
      const arr = [...p];
      arr.splice(idx + 1, 0, copie);
      return arr;
    });
  }

  function ajouterTemplate(template) {
    const types = {
      ligne: [
        { type: 'droit', longueur: 1000 },
        { type: 'coude90', nbSegments: 4 },
        { type: 'droit', longueur: 800 },
        { type: 'coude90', nbSegments: 4, orientation: 90 },
        { type: 'droit', longueur: 1000 },
      ],
      u: [
        { type: 'droit', longueur: 1200 },
        { type: 'coude90', nbSegments: 4 },
        { type: 'droit', longueur: 600 },
        { type: 'coude90', nbSegments: 4 },
        { type: 'droit', longueur: 1200 },
      ],
      derivation: [
        { type: 'droit', longueur: 1000 },
        { type: 'te', dnPiquage: params.dnDepart, hauteurPiquage: 200 },
        { type: 'droit', longueur: 1000 },
      ],
      coude_simple: [
        { type: 'droit', longueur: 500 },
        { type: 'coude90', nbSegments: 4 },
        { type: 'droit', longueur: 500 },
      ],
    };
    const items = types[template];
    if (!items) return;
    const newPieces = items.map(item => ({
      id: Date.now() + Math.random(),
      orientation: 0,
      ...item,
    }));
    setPieces(p => [...p, ...newPieces]);
  }

  function modifierPiece(id, updates) {
    setPieces(p => p.map(piece => piece.id === id ? { ...piece, ...updates } : piece));
  }

  function supprimerPiece(id) {
    setPieces(p => p.filter(piece => piece.id !== id));
  }

  function monterPiece(index) {
    if (index <= 0) return;
    setPieces(p => {
      const arr = [...p];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  }

  function descendrePiece(index) {
    if (index >= pieces.length - 1) return;
    setPieces(p => {
      const arr = [...p];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr;
    });
  }

  function tournerPiece(id) {
    setPieces(p => p.map(piece =>
      piece.id === id ? { ...piece, orientation: ((piece.orientation || 0) + 90) % 360 } : piece
    ));
  }

  function deplacerPiece(id, x, y) {
    setPieces(p => p.map(piece =>
      piece.id === id ? { ...piece, x, y } : piece
    ));
  }

  function viderLigne() {
    setPieces([]);
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* En-tete avec stats rapides */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#1d1d1f]">Ligne Complete</h2>
          <p className="text-[10px] text-[#86868b]">
            Construire une ligne de tuyauterie et generer les patrons de decoupe
          </p>
        </div>
        {pieces.length > 0 && (
          <div className="flex items-center gap-2">
            <StatBadge label="Pieces" value={stats.count} color="#f57c00" />
            <StatBadge label="Longueur" value={`${stats.longueur}m`} color="#3b82f6" />
            {stats.coudes > 0 && <StatBadge label="Coudes" value={stats.coudes} color="#f59e0b" />}
          </div>
        )}
      </div>

      {/* Parametres globaux - collapsible */}
      <div className="glass-card rounded-xl overflow-hidden">
        <button
          onClick={() => setShowParams(!showParams)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-black/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#f57c00]/10 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-[#f57c00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-[#1d1d1f]">Parametres de la ligne</span>
            <span className="text-[10px] text-[#86868b]">DN{params.dnDepart} / {params.epIsolant}mm / {(TYPES_TOLE.find(t => t.id === params.typeTole) || TYPES_TOLE[0]).label} {params.epTole}mm</span>
          </div>
          <svg className={`w-3.5 h-3.5 text-[#86868b] transition-transform duration-200 ${showParams ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showParams && (
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-black/[0.04] animate-accordion">
            {/* DN de depart + badge type isolant */}
            <div>
              <label className="section-label mb-1.5 block">DN de depart</label>
              <div className="flex gap-2 items-center">
                <select
                  value={params.dnDepart}
                  onChange={e => setParams(p => ({ ...p, dnDepart: Number(e.target.value) }))}
                  className="neo-input flex-1 text-xs"
                >
                  {DN_LIST.map(d => <option key={d} value={d}>DN{d} — De {DN_TABLE[d]} mm</option>)}
                </select>
                {/* Badge type isolant */}
                <span className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${
                  getInsulationType(params.dnDepart) === 'coquille'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {getInsulationType(params.dnDepart) === 'coquille' ? 'Coquille' : 'Matelas laine'}
                </span>
              </div>
              <p className="text-[9px] text-[#86868b] mt-1">
                {getInsulationType(params.dnDepart) === 'coquille'
                  ? 'DN \u2264 400 : isolant en coquilles pre-formees (2 demi-coquilles par unite)'
                  : 'DN > 400 : isolant en matelas laine de roche (decoupe a plat)'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Epaisseur isolant */}
              <div>
                <label className="section-label mb-1.5 block">Ep. isolant</label>
                <div className="flex gap-1">
                  {EPAISSEURS_ISOLANT.map(e => (
                    <button
                      key={e}
                      onClick={() => setParams(p => ({ ...p, epIsolant: e }))}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200 ${
                        params.epIsolant === e
                          ? 'bg-[#f57c00] text-white shadow-sm'
                          : 'bg-black/[0.03] text-[#6e6e73] hover:bg-black/[0.06]'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Epaisseur tole */}
              <div>
                <label className="section-label mb-1.5 block">Ep. tole ({(TYPES_TOLE.find(t => t.id === params.typeTole) || TYPES_TOLE[0]).label})</label>
                <div className="flex gap-1">
                  {EPAISSEUR_TOLE.map(e => (
                    <button
                      key={e}
                      onClick={() => setParams(p => ({ ...p, epTole: e }))}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200 ${
                        params.epTole === e
                          ? 'bg-[#3b82f6] text-white shadow-sm'
                          : 'bg-black/[0.03] text-[#6e6e73] hover:bg-black/[0.06]'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Type de tole */}
            <div>
              <label className="section-label mb-1.5 block">Type de tole</label>
              <div className="flex gap-1">
                {TYPES_TOLE.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setParams(p => ({ ...p, typeTole: t.id, epTole: t.defaultEp }))}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200 ${
                      params.typeTole === t.id
                        ? 'bg-[#3b82f6] text-white shadow-sm'
                        : 'bg-black/[0.03] text-[#6e6e73] hover:bg-black/[0.06]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rayon coudes */}
            <div>
              <label className="section-label mb-1.5 block">Rayon des coudes</label>
              <div className="flex gap-1">
                {[1.0, 1.5, 2.0].map(r => (
                  <button
                    key={r}
                    onClick={() => setParams(p => ({ ...p, rayonFacteur: r }))}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200 ${
                      params.rayonFacteur === r
                        ? 'bg-[#f59e0b] text-white shadow-sm'
                        : 'bg-black/[0.03] text-[#6e6e73] hover:bg-black/[0.06]'
                    }`}
                  >
                    {r}x DN
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation sections */}
      <div className="flex gap-0.5 bg-black/[0.03] rounded-lg p-0.5">
        {SECTIONS.map(s => {
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white text-[#f57c00] shadow-sm font-semibold'
                  : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.02]'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive ? 2 : 1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
              {s.label}
              {s.id === 'editeur' && pieces.length > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                  isActive ? 'bg-[#f57c00]/10 text-[#f57c00]' : 'bg-black/[0.04] text-[#aeaeb2]'
                }`}>
                  {pieces.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Contenu */}
      <div>
        {activeSection === 'editeur' && (
          <PieceEditor
            pieces={pieces}
            setPieces={setPieces}
            params={params}
            getDnAtIndex={getDnAtIndex}
            ajouterPiece={ajouterPiece}
            modifierPiece={modifierPiece}
            supprimerPiece={supprimerPiece}
            dupliquerPiece={dupliquerPiece}
            monterPiece={monterPiece}
            descendrePiece={descendrePiece}
            viderLigne={viderLigne}
            ajouterTemplate={ajouterTemplate}
          />
        )}
        {activeSection === 'schema' && (
          <VueSchema pieces={pieces} params={params} getDnAtIndex={getDnAtIndex} tournerPiece={tournerPiece} />
        )}
        {activeSection === '3d' && (
          <Vue3D pieces={pieces} params={params} getDnAtIndex={getDnAtIndex} />
        )}
        {activeSection === 'patrons' && (
          <PatronsDecoupe pieces={pieces} params={params} getDnAtIndex={getDnAtIndex} />
        )}
        {activeSection === 'recap' && (
          <RecapLigne pieces={pieces} params={params} getDnAtIndex={getDnAtIndex} />
        )}
      </div>
    </div>
  );
}

// Petit badge de stat
function StatBadge({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-black/[0.06] shadow-sm">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-[#86868b]">{label}</span>
      <span className="text-[11px] font-bold text-[#1d1d1f]">{value}</span>
    </div>
  );
}
