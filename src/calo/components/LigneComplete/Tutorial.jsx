import { useState, useEffect, useCallback } from 'react';

const STEPS = [
  {
    target: null,
    title: 'Bienvenue dans le Calorifugeur',
    text: 'Cet outil vous aide a calculer l\'isolant et la tole pour vos lignes de tuyauterie. On va vous guider en quelques etapes.',
    position: 'center',
  },
  {
    target: '[data-tuto="params"]',
    title: 'Parametres de la ligne',
    text: 'Commencez par choisir le diametre du tuyau (DN) et l\'epaisseur d\'isolant. Les valeurs par defaut conviennent pour la plupart des cas.',
    position: 'below',
  },
  {
    target: '[data-tuto="add-piece"]',
    title: 'Ajouter des pieces',
    text: 'Appuyez sur un type de piece pour l\'ajouter a votre ligne. Tuyau droit, coude, reduction... construisez votre ligne piece par piece.',
    position: 'below',
  },
  {
    target: '[data-tuto="templates"]',
    title: 'Modeles rapides',
    text: 'Pas envie de tout construire a la main ? Utilisez un modele pre-fait pour demarrer plus vite.',
    position: 'below',
  },
  {
    target: '[data-tuto="nav"]',
    title: 'Naviguer entre les vues',
    text: 'Editeur pour modifier, 2D et 3D pour visualiser, Patrons pour les decoupes, et Recap pour le recapitulatif materiaux.',
    position: 'above',
  },
  {
    target: null,
    title: 'C\'est parti !',
    text: 'Vous savez tout. Commencez par ajouter un tuyau droit ou choisissez un modele. Vous pouvez relancer ce guide a tout moment avec le bouton aide.',
    position: 'center',
  },
];

function getTargetRect(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

export default function Tutorial({ onClose }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);

  const currentStep = STEPS[step];

  const updateRect = useCallback(() => {
    const rect = getTargetRect(currentStep.target);
    setTargetRect(rect);
  }, [currentStep.target]);

  useEffect(() => {
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [updateRect]);

  // Scroll target into view
  useEffect(() => {
    if (currentStep.target) {
      const el = document.querySelector(currentStep.target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Update rect after scroll
        setTimeout(updateRect, 400);
      }
    }
  }, [currentStep.target, updateRect]);

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  const finish = () => {
    localStorage.setItem('calo_tuto_done', '1');
    onClose();
  };

  const isCenter = currentStep.position === 'center' || !targetRect;
  const pad = 8;

  return (
    <div className="fixed inset-0 z-[100]" onClick={(e) => e.stopPropagation()}>
      {/* Overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tuto-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - pad}
                y={targetRect.top - pad}
                width={targetRect.width + pad * 2}
                height={targetRect.height + pad * 2}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tuto-mask)"
          style={{ pointerEvents: 'auto' }}
          onClick={next}
        />
      </svg>

      {/* Highlight border */}
      {targetRect && (
        <div
          className="absolute border-2 border-[#F2A900] rounded-xl pointer-events-none animate-pulse"
          style={{
            left: targetRect.left - pad,
            top: targetRect.top - pad,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
            boxShadow: '0 0 0 4px rgba(242,169,0,0.2)',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute z-10 animate-tuto-in"
        style={isCenter ? {
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(360px, 90vw)',
        } : currentStep.position === 'below' ? {
          left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 340)),
          top: targetRect.bottom + pad + 12,
          width: 'min(320px, 85vw)',
        } : {
          left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 340)),
          top: targetRect.top - pad - 12,
          transform: 'translateY(-100%)',
          width: 'min(320px, 85vw)',
        }}
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-black/10 overflow-hidden">
          {/* Step indicator */}
          <div className="flex items-center gap-1 px-4 pt-3.5 pb-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full flex-1 transition-all duration-300"
                style={{
                  background: i <= step ? '#F2A900' : '#e5e7eb',
                  opacity: i === step ? 1 : 0.6,
                }}
              />
            ))}
          </div>

          {/* Content */}
          <div className="px-5 py-3">
            <h3 className="text-base font-bold text-[#1d1d1f] mb-1.5">{currentStep.title}</h3>
            <p className="text-sm text-[#6e6e73] leading-relaxed">{currentStep.text}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-4 pb-4 pt-1">
            {step > 0 && (
              <button
                onClick={prev}
                className="h-11 px-4 rounded-xl text-sm font-medium text-[#86868b] hover:bg-black/[0.04] active:scale-95 transition-all"
              >
                Retour
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={finish}
              className="h-11 px-4 rounded-xl text-sm font-medium text-[#86868b] hover:bg-black/[0.04] active:scale-95 transition-all"
            >
              Passer
            </button>
            <button
              onClick={next}
              className="h-11 px-6 rounded-xl text-sm font-semibold text-white bg-[#F2A900] hover:bg-[#d99a00] active:scale-95 transition-all shadow-sm"
            >
              {step === STEPS.length - 1 ? 'Commencer' : 'Suivant'}
            </button>
          </div>
        </div>
      </div>

      {/* CSS */}
      <style>{`
        @keyframes tuto-in {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-tuto-in { animation: tuto-in 0.25s ease-out both; }
      `}</style>
    </div>
  );
}
