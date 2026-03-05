import { useState, useMemo } from 'react';
import { Wand2, X, Package } from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';
import { generateScaffold, type ScaffoldConfig, type GenerationResult } from '../engine/scaffoldGenerator';
import { ALL_PIECES, PIECES_BY_CATEGORY } from '../catalog/definitions';

const MAX_HEIGHTS = [2, 3, 4, 5, 6, 8, 10];
const BAY_LENGTHS = [0.73, 1.09, 1.40, 1.57, 2.07, 2.57, 3.07];
const DEPTHS = [0.73, 1.09, 1.40];
const CONSOLE_OPTIONS = [0, 0.36, 0.73];
const BASE_JACK_OPTIONS = [20, 40, 60];

/** Génère les paliers possibles (tous les 2m) pour une hauteur max donnée */
function possibleLevels(maxHeight: number): number[] {
  const levels: number[] = [];
  for (let h = 2; h <= maxHeight; h += 2) {
    levels.push(h);
  }
  // Ajouter la hauteur max si elle n'est pas déjà un multiple de 2
  if (maxHeight % 2 !== 0 && maxHeight > 0) {
    levels.push(maxHeight);
  }
  return levels.sort((a, b) => a - b);
}

function SelectField({
  label,
  value,
  options,
  onChange,
  format,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[11px] text-[#888899]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="neo-input text-[11px] w-28 py-1.5"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {format ? format(opt) : opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[11px] text-[#888899]">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`w-9 h-[18px] rounded-full transition-all duration-200 relative ${
          checked
            ? 'bg-[#e8c840]/25 border border-[#e8c840]/40 shadow-[0_0_8px_rgba(232,200,64,0.1)]'
            : 'bg-white/[0.04] border border-white/10'
        }`}
      >
        <span
          className={`absolute top-[2px] w-3.5 h-3.5 rounded-full transition-all duration-200 ${
            checked
              ? 'left-[18px] bg-[#e8c840] shadow-[0_0_6px_rgba(232,200,64,0.4)]'
              : 'left-[2px] bg-[#555566]'
          }`}
        />
      </button>
    </div>
  );
}

function AsciiPreview({ config }: { config: ScaffoldConfig }) {
  const n = config.bayCount;
  const sortedLevels = [...config.levels].sort((a, b) => b - a);
  const lines: string[] = [];

  for (const level of sortedLevels) {
    if (config.guardrails) {
      lines.push(`GC  ${'═'.repeat(n * 8)}  (+1.0m @${level}m)`);
    }
    // Montrer les mailles à vide dans les plateformes
    const bayChars = Array.from({ length: n }, (_, i) =>
      config.emptyBays.includes(i) ? '░░░░░░░░' : '████████'
    ).join('');
    lines.push(`    ${bayChars}  plancher ${level}m`);
  }

  lines.push(`|   ${'═'.repeat(n * 8)} |  longeron`);
  if (config.diagonals) {
    lines.push(`|     ╱${'         ╱'.repeat(Math.max(0, n - 1))}        |  diag`);
  }
  lines.push(`|   ${'═'.repeat(n * 8)} |  sol`);
  lines.push(`▽${'                ▽'.repeat(Math.min(n, 2))}  vérins`);

  return (
    <pre className="text-[9px] leading-[13px] text-[#e8c840]/70 font-mono whitespace-pre overflow-x-auto">
      {lines.join('\n')}
    </pre>
  );
}

/** Approvisionnement complet groupé par catégorie */
function FullBOM({ breakdown }: { breakdown: Record<string, { count: number; weight: number }> }) {
  // Grouper les pièces du breakdown par catégorie
  const grouped: Record<string, { label: string; items: { defId: string; name: string; count: number; weight: number; unitWeight: number }[] }> = {};

  for (const [defId, { count, weight }] of Object.entries(breakdown)) {
    const def = ALL_PIECES[defId];
    if (!def) continue;
    const cat = def.category;
    if (!grouped[cat]) {
      // Trouver le label de la catégorie
      const catInfo = PIECES_BY_CATEGORY[cat];
      grouped[cat] = { label: catInfo?.label || cat, items: [] };
    }
    grouped[cat].items.push({
      defId,
      name: def.name,
      count,
      weight: Math.round(weight * 10) / 10,
      unitWeight: def.weightKg,
    });
  }

  // Trier catégories dans un ordre logique
  const categoryOrder = ['baseJack', 'standard', 'ledger', 'diagonal', 'platform', 'guardrail', 'toeboard', 'console', 'ladder', 'clamp', 'tube', 'castor', 'accessory'];
  const sortedCategories = Object.entries(grouped).sort(([a], [b]) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
      {sortedCategories.map(([cat, { label, items }]) => (
        <div key={cat}>
          <div className="text-[9px] uppercase tracking-wider text-[#e8c840]/60 font-semibold mb-0.5">
            {label}
          </div>
          {items
            .sort((a, b) => b.count - a.count)
            .map(({ defId, name, count, weight, unitWeight }) => (
              <div key={defId} className="flex items-center justify-between text-[10px] py-px">
                <span className="text-[#888899] truncate mr-2">{name}</span>
                <span className="text-white/50 whitespace-nowrap">
                  {count}× ({unitWeight} kg/u) — {weight} kg
                </span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

export function GeneratorModal() {
  const { showGenerator, setShowGenerator, bulkAddPieces, addToast } = useEditorStore();

  const [config, setConfig] = useState<ScaffoldConfig>({
    maxHeight: 2,
    levels: [2],
    bayLength: 2.07,
    bayCount: 1,
    depth: 0.73,
    trapdoors: false,
    consoleOffset: 0,
    guardrails: true,
    toeboards: true,
    diagonals: true,
    baseJackCm: 40,
    emptyBays: [],
  });

  const update = <K extends keyof ScaffoldConfig>(key: K, value: ScaffoldConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Quand la hauteur max change, ajuster les paliers
  const handleMaxHeightChange = (newMax: number) => {
    const available = possibleLevels(newMax);
    // Garder les paliers existants qui sont encore valides, + forcer le palier max
    const keptLevels = config.levels.filter((l) => l <= newMax && available.includes(l));
    if (!keptLevels.includes(newMax) && available.includes(newMax)) {
      keptLevels.push(newMax);
    }
    setConfig((prev) => ({
      ...prev,
      maxHeight: newMax,
      levels: keptLevels.length > 0 ? keptLevels : [newMax],
    }));
  };

  // Toggle un palier
  const toggleLevel = (level: number) => {
    setConfig((prev) => {
      const has = prev.levels.includes(level);
      if (has) {
        // Ne pas permettre de tout décocher
        const newLevels = prev.levels.filter((l) => l !== level);
        return { ...prev, levels: newLevels.length > 0 ? newLevels : prev.levels };
      } else {
        return { ...prev, levels: [...prev.levels, level].sort((a, b) => a - b) };
      }
    });
  };

  // Toggle une maille à vide
  const toggleEmptyBay = (bayIndex: number) => {
    setConfig((prev) => {
      const has = prev.emptyBays.includes(bayIndex);
      if (has) {
        return { ...prev, emptyBays: prev.emptyBays.filter((i) => i !== bayIndex) };
      } else {
        return { ...prev, emptyBays: [...prev.emptyBays, bayIndex] };
      }
    });
  };

  // Quand bayCount change, nettoyer emptyBays
  const handleBayCountChange = (newCount: number) => {
    setConfig((prev) => ({
      ...prev,
      bayCount: newCount,
      emptyBays: prev.emptyBays.filter((i) => i < newCount),
    }));
  };

  const availableLevels = possibleLevels(config.maxHeight);
  const result: GenerationResult = useMemo(() => generateScaffold(config), [config]);

  const handleGenerate = () => {
    bulkAddPieces(result.pieces);
    setShowGenerator(false);
    addToast(`${result.summary.totalPieces} pièces générées (${result.summary.totalWeight} kg)`, 'success');
  };

  if (!showGenerator) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-modal-backdrop"
      onClick={() => setShowGenerator(false)}
    >
      <div
        className="glass-panel rounded-2xl w-[560px] max-h-[90vh] overflow-y-auto p-5 animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#e8c840]/10 border border-[#e8c840]/20 flex items-center justify-center">
              <Wand2 size={16} className="text-[#e8c840]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Générateur d'échafaudage</h2>
              <p className="text-[9px] text-[#555566] mt-0.5">
                Configure les paramètres puis clique sur Générer
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowGenerator(false)}
            className="p-1.5 rounded-md hover:bg-white/[0.06] text-[#888899] hover:text-white/80 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-2.5 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-[#555566] font-semibold mt-1">
            Dimensions
          </div>

          <SelectField
            label="Hauteur max"
            value={config.maxHeight}
            options={MAX_HEIGHTS}
            onChange={handleMaxHeightChange}
            format={(v) => `${v}m`}
          />

          {/* Paliers (checkboxes) */}
          <div className="flex items-start justify-between">
            <label className="text-xs text-[#888899] pt-0.5">Paliers</label>
            <div className="flex flex-wrap gap-1.5 max-w-[220px] justify-end">
              {availableLevels.map((level) => {
                const isChecked = config.levels.includes(level);
                return (
                  <button
                    key={level}
                    onClick={() => toggleLevel(level)}
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${
                      isChecked
                        ? 'bg-[#e8c840]/20 border border-[#e8c840]/50 text-[#e8c840]'
                        : 'bg-white/5 border border-white/10 text-[#555566]'
                    }`}
                  >
                    {level}m
                  </button>
                );
              })}
            </div>
          </div>

          <SelectField
            label="Longueur travée"
            value={config.bayLength}
            options={BAY_LENGTHS}
            onChange={(v) => update('bayLength', v)}
            format={(v) => `${v}m`}
          />
          <div className="flex items-center justify-between">
            <label className="text-xs text-[#888899]">Nombre de travées</label>
            <input
              type="number"
              min={1}
              max={5}
              value={config.bayCount}
              onChange={(e) => handleBayCountChange(Math.max(1, Math.min(5, Number(e.target.value))))}
              className="neo-input text-xs w-28 py-1 text-center"
            />
          </div>

          {/* Mailles à vide */}
          {config.bayCount > 1 && (
            <div className="flex items-start justify-between">
              <label className="text-xs text-[#888899] pt-0.5">Mailles à vide</label>
              <div className="flex gap-1.5">
                {Array.from({ length: config.bayCount }, (_, i) => {
                  const isEmpty = config.emptyBays.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleEmptyBay(i)}
                      title={isEmpty ? `Travée ${i + 1} : vide` : `Travée ${i + 1} : pleine`}
                      className={`w-8 h-6 text-[9px] rounded transition-all flex items-center justify-center ${
                        isEmpty
                          ? 'bg-red-500/15 border border-red-500/40 text-red-400'
                          : 'bg-white/5 border border-white/10 text-[#888899]'
                      }`}
                    >
                      {isEmpty ? '░' : `T${i + 1}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <SelectField
            label="Profondeur"
            value={config.depth}
            options={DEPTHS}
            onChange={(v) => update('depth', v)}
            format={(v) => `${v}m`}
          />
          <SelectField
            label="Vérin de base"
            value={config.baseJackCm}
            options={BASE_JACK_OPTIONS}
            onChange={(v) => update('baseJackCm', v)}
            format={(v) => `${v}cm`}
          />

          <div className="w-full h-px bg-white/5 my-1" />
          <div className="text-[10px] uppercase tracking-wider text-[#555566] font-semibold">
            Options
          </div>

          <CheckboxField
            label="Accès trappes"
            checked={config.trapdoors}
            onChange={(v) => update('trapdoors', v)}
          />
          <SelectField
            label="Déport (console)"
            value={config.consoleOffset}
            options={CONSOLE_OPTIONS}
            onChange={(v) => update('consoleOffset', v)}
            format={(v) => (v === 0 ? 'Aucun' : `${v}m`)}
          />
          <CheckboxField
            label="Garde-corps"
            checked={config.guardrails}
            onChange={(v) => update('guardrails', v)}
          />
          <CheckboxField
            label="Plinthes"
            checked={config.toeboards}
            onChange={(v) => update('toeboards', v)}
          />
          <CheckboxField
            label="Diagonales"
            checked={config.diagonals}
            onChange={(v) => update('diagonals', v)}
          />
        </div>

        {/* Preview */}
        <div className="glass-card p-3 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-[#555566] font-semibold mb-2">
            Aperçu
          </div>
          <AsciiPreview config={config} />

          <div className="flex gap-4 mt-3 text-xs">
            <div>
              <span className="text-[#555566]">Pièces : </span>
              <span className="text-[#e8c840] font-semibold">{result.summary.totalPieces}</span>
            </div>
            <div>
              <span className="text-[#555566]">Poids : </span>
              <span className="text-[#e8c840] font-semibold">{result.summary.totalWeight} kg</span>
            </div>
            <div>
              <span className="text-[#555566]">Vues : </span>
              <span className="text-white/70">
                F:{result.pieces.face.length} C:{result.pieces.side.length} D:{result.pieces.top.length}
              </span>
            </div>
          </div>

          {/* Approvisionnement complet */}
          <div className="divider-h my-3" />
          <div className="flex items-center gap-1.5 mb-2">
            <Package size={11} className="text-[#555566]" />
            <span className="section-label">Approvisionnement</span>
          </div>
          <FullBOM breakdown={result.summary.breakdown} />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={() => setShowGenerator(false)} className="glass-button text-[11px]">
            Annuler
          </button>
          <button
            onClick={handleGenerate}
            className="glass-button gold text-[11px]"
          >
            <Wand2 size={13} />
            Générer ({result.summary.totalPieces} pièces)
          </button>
        </div>
      </div>
    </div>
  );
}
