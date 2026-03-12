/**
 * Vue3D.jsx — Visualisation 3D WebGL d'une ligne de tuyauterie calorifugee
 *
 * Utilise React Three Fiber (Three.js) pour un rendu 3D interactif
 * avec 3 couches concentriques : tube interieur, isolant, tole exterieure.
 *
 * Remplacement complet de l'ancienne version SVG par du vrai WebGL.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { DN_TABLE } from '../../utils/calculs';
import { rayonCintrage } from '../../utils/calculs-coude';

// ── Constantes ──

// Facteur d'echelle : mm → unites 3D (1 unite = 1000mm = 1m)
const SCALE = 1 / 1000;

// Nombre de segments radiaux pour les cylindres/tores (qualite du rendu)
const RADIAL_SEGMENTS = 32;
// Nombre de segments le long des coudes
const ARC_SEGMENTS = 24;

// Couleurs et proprietes des materiaux
const LAYER_CONFIG = {
  tube: {
    color: '#4682B4',     // Steel blue
    metalness: 0.6,
    roughness: 0.3,
    opacity: 1.0,
    transparent: false,
    label: 'Tube',
  },
  isolant: {
    color: '#F2A900',     // Amber (chantier-orange)
    metalness: 0.0,
    roughness: 0.9,
    opacity: 0.4,
    transparent: true,
    label: 'Isolant',
  },
  tole: {
    color: '#C0C0C0',     // Silver
    metalness: 0.8,
    roughness: 0.2,
    opacity: 1.0,
    transparent: false,
    label: 'Tole',
  },
};

// Presets de camera (position [x, y, z])
const CAMERA_PRESETS = {
  Face:   { position: [0, 0, 3],   target: [0, 0, 0] },
  Dessus: { position: [0, 3, 0],   target: [0, 0, 0] },
  Cote:   { position: [3, 0, 0],   target: [0, 0, 0] },
  Iso:    { position: [2, 1.5, 2], target: [0, 0, 0] },
};

// ── Maths vectorielles ──

function rotateVector(v, axis, angle) {
  const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  return v.clone().applyQuaternion(q);
}

// ── Calcul des rayons pour un DN donne ──
function getRadii(dn, De, epIsolant, epTole) {
  const rTube = (De / 2) * SCALE;
  const rIsolant = (De / 2 + epIsolant) * SCALE;
  const rTole = (De / 2 + epIsolant + epTole) * SCALE;
  return { rTube, rIsolant, rTole };
}

// ── Composants geometriques individuels ──

/**
 * Couche cylindrique (tube droit)
 * Rendu via CylinderGeometry oriente le long de l'axe du tuyau
 */
function CylinderLayer({ radius, length, color, metalness, roughness, opacity, transparent, visible }) {
  if (!visible) return null;

  return (
    <mesh>
      <cylinderGeometry args={[radius, radius, length, RADIAL_SEGMENTS, 1, true]} />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        opacity={opacity}
        transparent={transparent}
        side={transparent ? THREE.DoubleSide : THREE.FrontSide}
        depthWrite={!transparent}
      />
    </mesh>
  );
}

/**
 * Bouchon (disque) a l'extremite d'un tuyau
 */
function CapDisc({ radius, color }) {
  return (
    <mesh>
      <circleGeometry args={[radius, RADIAL_SEGMENTS]} />
      <meshStandardMaterial
        color={color || '#e0e0e0'}
        metalness={0.3}
        roughness={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Piece droite avec 3 couches concentriques
 */
function PieceDroite({ position, direction, length, radii, show, pieceIndex }) {
  // CylinderGeometry est oriente le long de Y par defaut
  // On doit le tourner pour qu'il pointe dans la direction voulue
  const groupRef = useRef();

  const { quaternion, midPoint } = useMemo(() => {
    const dir = direction.clone().normalize();
    // Le cylindre est oriente en Y, on le tourne vers dir
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const mid = position.clone().add(dir.clone().multiplyScalar(length / 2));
    return { quaternion: quat, midPoint: mid };
  }, [position, direction, length]);

  const layers = useMemo(() => [
    { key: 'tube', radius: radii.rTube, ...LAYER_CONFIG.tube },
    { key: 'isolant', radius: radii.rIsolant, ...LAYER_CONFIG.isolant },
    { key: 'tole', radius: radii.rTole, ...LAYER_CONFIG.tole },
  ], [radii]);

  return (
    <group position={midPoint.toArray()} quaternion={quaternion}>
      {layers.map(layer => (
        <CylinderLayer
          key={layer.key}
          radius={layer.radius}
          length={length}
          color={layer.color}
          metalness={layer.metalness}
          roughness={layer.roughness}
          opacity={layer.opacity}
          transparent={layer.transparent}
          visible={show[layer.key]}
        />
      ))}
      {/* Bouchons aux extremites */}
      <group position={[0, length / 2, 0]}>
        <CapDisc radius={show.tole ? radii.rTole : show.isolant ? radii.rIsolant : radii.rTube} />
      </group>
      <group position={[0, -length / 2, 0]} rotation={[Math.PI, 0, 0]}>
        <CapDisc radius={show.tole ? radii.rTole : show.isolant ? radii.rIsolant : radii.rTube} />
      </group>
      {/* Label flottant */}
      <Html position={[0, length / 2 + radii.rTole * 2, 0]} center distanceFactor={3}
        style={{ pointerEvents: 'none' }}>
        <div className="bg-white/90 dark:bg-gray-800/90 text-[10px] font-bold text-gray-700 dark:text-gray-200
          px-1.5 py-0.5 rounded shadow-sm border border-gray-200 dark:border-gray-600 whitespace-nowrap">
          P{pieceIndex + 1}
        </div>
      </Html>
    </group>
  );
}

/**
 * Couche de coude (tore partiel)
 * Utilise TorusGeometry avec un arc partiel
 */
function TorusLayer({ arcCenter, arcRadius, tubeRadius, arcAngle, startQuat, color, metalness, roughness, opacity, transparent, visible }) {
  if (!visible) return null;

  const geometry = useMemo(() => {
    // TorusGeometry(radius, tube, radialSegments, tubularSegments, arc)
    return new THREE.TorusGeometry(arcRadius, tubeRadius, RADIAL_SEGMENTS, ARC_SEGMENTS, arcAngle);
  }, [arcRadius, tubeRadius, arcAngle]);

  return (
    <mesh geometry={geometry} position={arcCenter.toArray()} quaternion={startQuat}>
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        opacity={opacity}
        transparent={transparent}
        side={transparent ? THREE.DoubleSide : THREE.FrontSide}
        depthWrite={!transparent}
      />
    </mesh>
  );
}

/**
 * Piece coude (90° ou 45°) avec 3 couches concentriques
 * Le tore est positionne de sorte que l'entree du coude soit au point de depart
 * et la sortie pointe dans la nouvelle direction apres rotation.
 */
function PieceCoude({ position, direction, up, arcAngle, bendRadius, radii, show, pieceIndex, orientation }) {
  const { arcCenter, quaternion, labelPos } = useMemo(() => {
    const dir = direction.clone().normalize();
    const upVec = up.clone().normalize();

    // Direction de courbure : par defaut c'est "up", mais on peut orienter
    let bendDir = upVec.clone();
    if (orientation !== 0) {
      bendDir = rotateVector(upVec, dir, (orientation * Math.PI) / 180);
    }

    // Axe de rotation = perpendiculaire au plan de courbure
    const bendAxis = new THREE.Vector3().crossVectors(dir, bendDir).normalize();

    // Centre de l'arc
    const center = position.clone().add(bendDir.clone().multiplyScalar(bendRadius));

    // On doit orienter le tore correctement :
    // Par defaut, TorusGeometry est dans le plan XY, avec le trou centre a l'origine
    // L'arc commence sur l'axe +X et tourne dans le plan XY

    // On veut que :
    // - L'axe du trou du tore = bendAxis (axe de rotation du coude)
    // - Le debut de l'arc pointe vers position depuis center (= -bendDir)

    // Vecteur du centre vers le debut (position)
    const toStart = position.clone().sub(center).normalize(); // = -bendDir

    // Construire une matrice de rotation pour orienter le tore
    // X du tore → toStart, Z du tore → bendAxis
    const torusX = toStart.clone();
    const torusZ = bendAxis.clone();
    const torusY = new THREE.Vector3().crossVectors(torusZ, torusX).normalize();

    const rotMatrix = new THREE.Matrix4().makeBasis(torusX, torusY, torusZ);
    const quat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

    // Position du label au milieu de l'arc
    const midAngle = arcAngle / 2;
    const midDir = rotateVector(toStart, bendAxis, midAngle);
    const labelPosition = center.clone().add(midDir.clone().multiplyScalar(bendRadius));

    return { arcCenter: center, quaternion: quat, labelPos: labelPosition };
  }, [position, direction, up, arcAngle, bendRadius, orientation]);

  const layers = useMemo(() => [
    { key: 'tube', radius: radii.rTube, ...LAYER_CONFIG.tube },
    { key: 'isolant', radius: radii.rIsolant, ...LAYER_CONFIG.isolant },
    { key: 'tole', radius: radii.rTole, ...LAYER_CONFIG.tole },
  ], [radii]);

  return (
    <group>
      {layers.map(layer => (
        <TorusLayer
          key={layer.key}
          arcCenter={arcCenter}
          arcRadius={bendRadius}
          tubeRadius={layer.radius}
          arcAngle={arcAngle}
          startQuat={quaternion}
          color={layer.color}
          metalness={layer.metalness}
          roughness={layer.roughness}
          opacity={layer.opacity}
          transparent={layer.transparent}
          visible={show[layer.key]}
        />
      ))}
      {/* Label flottant */}
      <Html position={labelPos.toArray()} center distanceFactor={3}
        style={{ pointerEvents: 'none' }}>
        <div className="bg-white/90 dark:bg-gray-800/90 text-[10px] font-bold text-gray-700 dark:text-gray-200
          px-1.5 py-0.5 rounded shadow-sm border border-gray-200 dark:border-gray-600 whitespace-nowrap">
          P{pieceIndex + 1}
        </div>
      </Html>
    </group>
  );
}

/**
 * Couche conique pour la reduction
 * Utilise CylinderGeometry avec radiusTop != radiusBottom
 */
function ConeLayer({ radiusStart, radiusEnd, length, color, metalness, roughness, opacity, transparent, visible }) {
  if (!visible) return null;

  return (
    <mesh>
      <cylinderGeometry args={[radiusEnd, radiusStart, length, RADIAL_SEGMENTS, 1, true]} />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        opacity={opacity}
        transparent={transparent}
        side={transparent ? THREE.DoubleSide : THREE.FrontSide}
        depthWrite={!transparent}
      />
    </mesh>
  );
}

/**
 * Piece reduction (cone) — transition d'un DN vers un autre
 */
function PieceReduction({ position, direction, length, radiiStart, radiiEnd, show, pieceIndex }) {
  const { quaternion, midPoint } = useMemo(() => {
    const dir = direction.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const mid = position.clone().add(dir.clone().multiplyScalar(length / 2));
    return { quaternion: quat, midPoint: mid };
  }, [position, direction, length]);

  const layers = useMemo(() => [
    { key: 'tube', rStart: radiiStart.rTube, rEnd: radiiEnd.rTube, ...LAYER_CONFIG.tube },
    { key: 'isolant', rStart: radiiStart.rIsolant, rEnd: radiiEnd.rIsolant, ...LAYER_CONFIG.isolant },
    { key: 'tole', rStart: radiiStart.rTole, rEnd: radiiEnd.rTole, ...LAYER_CONFIG.tole },
  ], [radiiStart, radiiEnd]);

  return (
    <group position={midPoint.toArray()} quaternion={quaternion}>
      {layers.map(layer => (
        <ConeLayer
          key={layer.key}
          radiusStart={layer.rStart}
          radiusEnd={layer.rEnd}
          length={length}
          color={layer.color}
          metalness={layer.metalness}
          roughness={layer.roughness}
          opacity={layer.opacity}
          transparent={layer.transparent}
          visible={show[layer.key]}
        />
      ))}
      {/* Bouchons */}
      <group position={[0, -length / 2, 0]} rotation={[Math.PI, 0, 0]}>
        <CapDisc radius={show.tole ? radiiStart.rTole : show.isolant ? radiiStart.rIsolant : radiiStart.rTube} />
      </group>
      <group position={[0, length / 2, 0]}>
        <CapDisc radius={show.tole ? radiiEnd.rTole : show.isolant ? radiiEnd.rIsolant : radiiEnd.rTube} />
      </group>
      {/* Label */}
      <Html position={[0, length / 2 + radiiStart.rTole * 2, 0]} center distanceFactor={3}
        style={{ pointerEvents: 'none' }}>
        <div className="bg-white/90 dark:bg-gray-800/90 text-[10px] font-bold text-gray-700 dark:text-gray-200
          px-1.5 py-0.5 rounded shadow-sm border border-gray-200 dark:border-gray-600 whitespace-nowrap">
          P{pieceIndex + 1}
        </div>
      </Html>
    </group>
  );
}

/**
 * Piece Te — tuyau principal + piquage perpendiculaire
 */
function PieceTe({ position, direction, up, radii, radiiPiquage, longueurCollecteur, longueurPiquage, show, pieceIndex }) {
  const { quaternionMain, midPointMain, quaternionBranch, midPointBranch, branchStart } = useMemo(() => {
    const dir = direction.clone().normalize();
    const upVec = up.clone().normalize();
    const yAxis = new THREE.Vector3(0, 1, 0);

    // Collecteur principal
    const quatMain = new THREE.Quaternion().setFromUnitVectors(yAxis, dir);
    const midMain = position.clone().add(dir.clone().multiplyScalar(longueurCollecteur / 2));

    // Piquage perpendiculaire (part du milieu du collecteur, direction = up)
    const bStart = position.clone().add(dir.clone().multiplyScalar(longueurCollecteur / 2));
    const piqDir = upVec.clone().negate(); // Vers le haut (up pointe vers le bas en convention ecran)
    const quatBranch = new THREE.Quaternion().setFromUnitVectors(yAxis, piqDir);
    const midBranch = bStart.clone().add(piqDir.clone().multiplyScalar(longueurPiquage / 2));

    return {
      quaternionMain: quatMain,
      midPointMain: midMain,
      quaternionBranch: quatBranch,
      midPointBranch: midBranch,
      branchStart: bStart,
    };
  }, [position, direction, up, longueurCollecteur, longueurPiquage]);

  const mainLayers = useMemo(() => [
    { key: 'tube', radius: radii.rTube, ...LAYER_CONFIG.tube },
    { key: 'isolant', radius: radii.rIsolant, ...LAYER_CONFIG.isolant },
    { key: 'tole', radius: radii.rTole, ...LAYER_CONFIG.tole },
  ], [radii]);

  const branchLayers = useMemo(() => [
    { key: 'tube', radius: radiiPiquage.rTube, ...LAYER_CONFIG.tube },
    { key: 'isolant', radius: radiiPiquage.rIsolant, ...LAYER_CONFIG.isolant },
    { key: 'tole', radius: radiiPiquage.rTole, ...LAYER_CONFIG.tole },
  ], [radiiPiquage]);

  return (
    <group>
      {/* Collecteur principal */}
      <group position={midPointMain.toArray()} quaternion={quaternionMain}>
        {mainLayers.map(layer => (
          <CylinderLayer
            key={`main-${layer.key}`}
            radius={layer.radius}
            length={longueurCollecteur}
            color={layer.color}
            metalness={layer.metalness}
            roughness={layer.roughness}
            opacity={layer.opacity}
            transparent={layer.transparent}
            visible={show[layer.key]}
          />
        ))}
        {/* Bouchons collecteur */}
        <group position={[0, longueurCollecteur / 2, 0]}>
          <CapDisc radius={show.tole ? radii.rTole : show.isolant ? radii.rIsolant : radii.rTube} />
        </group>
        <group position={[0, -longueurCollecteur / 2, 0]} rotation={[Math.PI, 0, 0]}>
          <CapDisc radius={show.tole ? radii.rTole : show.isolant ? radii.rIsolant : radii.rTube} />
        </group>
      </group>

      {/* Piquage perpendiculaire */}
      <group position={midPointBranch.toArray()} quaternion={quaternionBranch}>
        {branchLayers.map(layer => (
          <CylinderLayer
            key={`branch-${layer.key}`}
            radius={layer.radius}
            length={longueurPiquage}
            color={layer.color}
            metalness={layer.metalness}
            roughness={layer.roughness}
            opacity={layer.opacity}
            transparent={layer.transparent}
            visible={show[layer.key]}
          />
        ))}
        {/* Bouchon extremite piquage */}
        <group position={[0, longueurPiquage / 2, 0]}>
          <CapDisc radius={show.tole ? radiiPiquage.rTole : show.isolant ? radiiPiquage.rIsolant : radiiPiquage.rTube} />
        </group>
      </group>

      {/* Label */}
      <Html position={midPointMain.toArray()} center distanceFactor={3}
        style={{ pointerEvents: 'none' }}>
        <div className="bg-white/90 dark:bg-gray-800/90 text-[10px] font-bold text-gray-700 dark:text-gray-200
          px-1.5 py-0.5 rounded shadow-sm border border-gray-200 dark:border-gray-600 whitespace-nowrap">
          P{pieceIndex + 1}
        </div>
      </Html>
    </group>
  );
}

// ── Grille au sol ──

function GridFloor({ visible, darkMode }) {
  if (!visible) return null;
  return (
    <group>
      <gridHelper
        args={[4, 40, darkMode ? '#334155' : '#cbd5e1', darkMode ? '#1e293b' : '#e2e8f0']}
        position={[0, -0.01, 0]}
      />
      {/* Axes de reference */}
      <group position={[0, 0, 0]}>
        {/* X = rouge */}
        <mesh position={[0.5, 0, 0]}>
          <boxGeometry args={[1, 0.003, 0.003]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        {/* Y = vert */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.003, 1, 0.003]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
        {/* Z = bleu */}
        <mesh position={[0, 0, 0.5]}>
          <boxGeometry args={[0.003, 0.003, 1]} />
          <meshBasicMaterial color="#3b82f6" />
        </mesh>
      </group>
    </group>
  );
}

// ── Controleur de camera pour les presets ──

function CameraController({ preset, controlsRef }) {
  const { camera } = useThree();
  const prevPreset = useRef(null);

  useEffect(() => {
    if (preset && preset !== prevPreset.current) {
      prevPreset.current = preset;
      const p = CAMERA_PRESETS[preset];
      if (!p) return;

      camera.position.set(...p.position);
      camera.lookAt(...p.target);
      camera.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.set(...p.target);
        controlsRef.current.update();
      }
    }
  }, [preset, camera, controlsRef]);

  return null;
}

/**
 * Auto-cadrage : place la camera pour voir toute la scene
 */
function AutoFrame({ pieces, controlsRef }) {
  const { camera } = useThree();
  const hasFramed = useRef(false);

  useEffect(() => {
    // Re-cadrer quand les pieces changent
    hasFramed.current = false;
  }, [pieces]);

  useFrame(() => {
    if (hasFramed.current) return;
    if (!controlsRef.current) return;
    hasFramed.current = true;

    // Calculer le bounding box de la scene (basique)
    // On utilise une estimation basee sur les pieces
    const box = new THREE.Box3();
    // Parcourir tous les enfants de la scene
    controlsRef.current.object.parent?.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeBoundingBox();
        const childBox = child.geometry.boundingBox.clone();
        childBox.applyMatrix4(child.matrixWorld);
        box.union(childBox);
      }
    });

    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2.5;

    camera.position.set(
      center.x + distance * 0.6,
      center.y + distance * 0.4,
      center.z + distance * 0.6
    );
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  });

  return null;
}

// ── Construction de la scene 3D (pipeline layout) ──

function Pipeline({ pieces, params, getDnAtIndex, show }) {
  const { epIsolant, epTole, rayonFacteur } = params;

  // Construire le layout de la pipeline (positions, directions)
  const pipelineData = useMemo(() => {
    if (!pieces || pieces.length === 0) return [];

    const data = [];
    let pos = new THREE.Vector3(0, 0, 0);
    let dir = new THREE.Vector3(1, 0, 0);   // Direction initiale : +X
    let up = new THREE.Vector3(0, 1, 0);     // Y pointe vers le haut

    for (let idx = 0; idx < pieces.length; idx++) {
      const piece = pieces[idx];
      const dn = getDnAtIndex(idx);
      const De = DN_TABLE[dn] || 114.3;
      const radii = getRadii(dn, De, epIsolant, epTole);
      const orient = piece.orientation || 0;

      if (piece.type === 'droit') {
        const L = (piece.longueur || 1000) * SCALE;
        data.push({
          type: 'droit',
          position: pos.clone(),
          direction: dir.clone(),
          length: L,
          radii,
          pieceIndex: idx,
        });
        pos = pos.clone().add(dir.clone().multiplyScalar(L));

      } else if (piece.type === 'coude90' || piece.type === 'casse') {
        const totalAngle = piece.type === 'coude90' ? Math.PI / 2 : Math.PI / 4; // casse = 45 degrees
        const R = rayonCintrage(dn, rayonFacteur) * SCALE;

        // Sauvegarder l'etat de depart
        const sPos = pos.clone();
        const sDir = dir.clone().normalize();
        const sUp = up.clone().normalize();

        // Direction de courbure
        let bendDir = sUp.clone();
        if (orient !== 0) {
          bendDir = rotateVector(sUp, sDir, (orient * Math.PI) / 180);
        }

        // Axe de rotation
        const bendAxis = new THREE.Vector3().crossVectors(sDir, bendDir).normalize();

        // Centre de l'arc
        const arcCenter = sPos.clone().add(bendDir.clone().multiplyScalar(R));

        data.push({
          type: 'coude',
          position: sPos.clone(),
          direction: sDir.clone(),
          up: sUp.clone(),
          arcAngle: totalAngle,
          bendRadius: R,
          radii,
          pieceIndex: idx,
          orientation: orient,
        });

        // Mettre a jour position et direction apres le coude
        const relStart = sPos.clone().sub(arcCenter);
        pos = arcCenter.clone().add(rotateVector(relStart, bendAxis, totalAngle));
        dir = rotateVector(sDir, bendAxis, totalAngle).normalize();
        up = rotateVector(sUp, bendAxis, totalAngle).normalize();

      } else if (piece.type === 'reduction') {
        const De2 = DN_TABLE[piece.dnSortie] || De;
        const L = (piece.longueur || Math.max(Math.abs(De - De2) * 2, 200)) * SCALE;
        const radiiEnd = getRadii(piece.dnSortie || dn, De2, epIsolant, epTole);

        data.push({
          type: 'reduction',
          position: pos.clone(),
          direction: dir.clone(),
          length: L,
          radiiStart: radii,
          radiiEnd,
          pieceIndex: idx,
        });
        pos = pos.clone().add(dir.clone().multiplyScalar(L));

      } else if (piece.type === 'te') {
        const DePiq = DN_TABLE[piece.dnPiquage || dn] || De;
        const radiiPiq = getRadii(piece.dnPiquage || dn, DePiq, epIsolant, epTole);
        const lenCollecteur = De * 4 * SCALE;
        const lenPiquage = (piece.hauteurPiquage || DePiq * 2) * SCALE;

        data.push({
          type: 'te',
          position: pos.clone(),
          direction: dir.clone(),
          up: up.clone(),
          radii,
          radiiPiquage: radiiPiq,
          longueurCollecteur: lenCollecteur,
          longueurPiquage: lenPiquage,
          pieceIndex: idx,
        });
        pos = pos.clone().add(dir.clone().multiplyScalar(lenCollecteur));

      } else if (piece.type === 'piquage') {
        const DeSortie = DN_TABLE[piece.dnSortie] || De;
        const DePiq = DN_TABLE[piece.dnPiquage] || De;
        const radiiSortie = getRadii(piece.dnSortie || dn, DeSortie, epIsolant, epTole);
        const radiiPiq = getRadii(piece.dnPiquage || dn, DePiq, epIsolant, epTole);
        const lenCollecteur = De * 4 * SCALE;
        const lenPiquage = (piece.hauteurPiquage || 150) * SCALE;

        data.push({
          type: 'piquage',
          position: pos.clone(),
          direction: dir.clone(),
          up: up.clone(),
          radii,
          radiiSortie,
          radiiPiquage: radiiPiq,
          longueurCollecteur: lenCollecteur,
          longueurPiquage: lenPiquage,
          pieceIndex: idx,
        });
        pos = pos.clone().add(dir.clone().multiplyScalar(lenCollecteur));
      }
    }

    return data;
  }, [pieces, params, getDnAtIndex, epIsolant, epTole, rayonFacteur]);

  return (
    <group>
      {pipelineData.map((piece, i) => {
        if (piece.type === 'droit') {
          return (
            <PieceDroite
              key={`piece-${i}`}
              position={piece.position}
              direction={piece.direction}
              length={piece.length}
              radii={piece.radii}
              show={show}
              pieceIndex={piece.pieceIndex}
            />
          );
        }
        if (piece.type === 'coude') {
          return (
            <PieceCoude
              key={`piece-${i}`}
              position={piece.position}
              direction={piece.direction}
              up={piece.up}
              arcAngle={piece.arcAngle}
              bendRadius={piece.bendRadius}
              radii={piece.radii}
              show={show}
              pieceIndex={piece.pieceIndex}
              orientation={piece.orientation}
            />
          );
        }
        if (piece.type === 'reduction') {
          return (
            <PieceReduction
              key={`piece-${i}`}
              position={piece.position}
              direction={piece.direction}
              length={piece.length}
              radiiStart={piece.radiiStart}
              radiiEnd={piece.radiiEnd}
              show={show}
              pieceIndex={piece.pieceIndex}
            />
          );
        }
        if (piece.type === 'te') {
          return (
            <PieceTe
              key={`piece-${i}`}
              position={piece.position}
              direction={piece.direction}
              up={piece.up}
              radii={piece.radii}
              radiiPiquage={piece.radiiPiquage}
              longueurCollecteur={piece.longueurCollecteur}
              longueurPiquage={piece.longueurPiquage}
              show={show}
              pieceIndex={piece.pieceIndex}
            />
          );
        }
        if (piece.type === 'piquage') {
          // Render piquage similarly to te but with different radii for entry/exit/branch
          return (
            <PieceTe
              key={`piece-${i}`}
              position={piece.position}
              direction={piece.direction}
              up={piece.up}
              radii={piece.radii}
              radiiPiquage={piece.radiiPiquage}
              longueurCollecteur={piece.longueurCollecteur}
              longueurPiquage={piece.longueurPiquage}
              show={show}
              pieceIndex={piece.pieceIndex}
            />
          );
        }
        return null;
      })}
    </group>
  );
}

// ── Composant principal ──

export default function Vue3D({ pieces, params, getDnAtIndex, darkMode }) {
  const [show, setShow] = useState({ tube: true, isolant: true, tole: true });
  const [showGrid, setShowGrid] = useState(true);
  const [cameraPreset, setCameraPreset] = useState(null);
  const [presetCounter, setPresetCounter] = useState(0);
  const controlsRef = useRef(null);

  const hasPieces = pieces && pieces.length > 0;

  // Appliquer un preset de camera
  const applyPreset = useCallback((name) => {
    setCameraPreset(name);
    setPresetCounter(c => c + 1);
  }, []);

  // Reset la vue
  const resetView = useCallback(() => {
    setCameraPreset('Iso');
    setPresetCounter(c => c + 1);
  }, []);

  // Toggle une couche
  const toggleLayer = useCallback((layer) => {
    setShow(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  // ── Etat vide ──
  if (!hasPieces) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
          </svg>
          <p className="text-sm text-gray-400 dark:text-gray-500">Ajoutez des pieces dans l'editeur</p>
          <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">La vue 3D WebGL s'affichera ici</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* En-tete */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700">
        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-chantier-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
          </svg>
          Vue 3D
          <span className="text-[10px] font-normal text-gray-400 bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5">
            WebGL
          </span>
          <span className="text-[10px] font-normal text-gray-400 bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5">
            {pieces.length} piece{pieces.length > 1 ? 's' : ''}
          </span>
        </h4>

        {/* Presets de camera */}
        <div className="flex items-center gap-1.5">
          {Object.keys(CAMERA_PRESETS).map(name => (
            <button key={name} onClick={() => applyPreset(name)}
              className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              {name}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />
          <button onClick={resetView}
            className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            Reset
          </button>
        </div>
      </div>

      {/* Toggles des couches */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex gap-2">
          {Object.entries(LAYER_CONFIG).map(([key, config]) => (
            <button key={key} onClick={() => toggleLayer(key)}
              className={`flex items-center gap-1.5 text-[10px] rounded-full px-2.5 py-1 transition-all ${
                show[key]
                  ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 font-semibold'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
              }`}>
              <span className="w-2.5 h-2.5 rounded-full border-2" style={{
                background: show[key] ? config.color : 'transparent',
                borderColor: config.color,
              }} />
              {config.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 self-center" />

          {/* Toggle grille */}
          <button onClick={() => setShowGrid(g => !g)}
            className={`flex items-center gap-1.5 text-[10px] rounded-full px-2.5 py-1 transition-all ${
              showGrid
                ? 'bg-blue-600 text-white font-semibold'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
            }`}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M12 4v16" />
            </svg>
            Grille
          </button>
        </div>
      </div>

      {/* Canvas 3D */}
      <div className="p-2">
        <div className="rounded-lg overflow-hidden" style={{ height: '420px' }}>
          <Canvas
            shadows
            camera={{ position: [2, 1.5, 2], fov: 50, near: 0.001, far: 100 }}
            style={{
              background: darkMode
                ? 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)'
                : 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
            }}
            gl={{ antialias: true, alpha: false }}
          >
            {/* Eclairage */}
            <ambientLight intensity={0.5} />
            <directionalLight
              position={[5, 8, 5]}
              intensity={1.2}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
              shadow-camera-far={50}
              shadow-camera-left={-5}
              shadow-camera-right={5}
              shadow-camera-top={5}
              shadow-camera-bottom={-5}
            />
            <directionalLight position={[-3, 2, -3]} intensity={0.3} />

            {/* Ombres de contact au sol */}
            <ContactShadows
              position={[0, -0.02, 0]}
              opacity={0.3}
              scale={10}
              blur={2}
              far={4}
            />

            {/* Controles orbite */}
            <OrbitControls
              ref={controlsRef}
              enableDamping
              dampingFactor={0.12}
              minDistance={0.1}
              maxDistance={20}
              maxPolarAngle={Math.PI * 0.85}
            />

            {/* Controleur de presets camera */}
            <CameraController
              preset={cameraPreset}
              controlsRef={controlsRef}
              key={presetCounter}
            />

            {/* Auto-cadrage a l'ouverture */}
            <AutoFrame pieces={pieces} controlsRef={controlsRef} />

            {/* Grille au sol */}
            <GridFloor visible={showGrid} darkMode={darkMode} />

            {/* Pipeline 3D */}
            <Pipeline
              pieces={pieces}
              params={params}
              getDnAtIndex={getDnAtIndex}
              show={show}
            />
          </Canvas>
        </div>
      </div>

      {/* Barre d'info en bas */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900/50 text-[10px] text-gray-400">
        <span>
          Clic gauche: tourner | Clic droit: deplacer | Molette: zoomer
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          WebGL Three.js
        </span>
      </div>
    </div>
  );
}
