
import React, { useRef, useEffect, useCallback } from 'react';
import { Atom, Particle } from '../types';
import { ELEMENTS } from '../constants';

interface CanvasProps {
  timeScale: number;
  isPlaying: boolean;
  onAtomCountChange: (count: number) => void;
  clearTrigger: number;
  spawnRequest: { z: number; isoIndex: number; id: number } | null;
}

// --- SIMULATION CONFIGURATION ---
// Higher substeps = greater stability but more CPU load.
// 8 is a good balance for rigid VSEPR angular constraints.
const SUBSTEPS = 8; 

// Terminal velocity cap to prevent explosions from integration errors.
const MAX_SPEED = 20; 

// --- PHYSICS CONSTANTS ---
const DRAG_COEFF = 0.95; // Simulates air resistance/viscosity.
const BOND_STIFFNESS = 0.6; // Hooke's Law constant for bonds.
const BOND_DAMPING = 0.2;   // Damping to prevent perpetual bond oscillation.
const REACTION_THRESHOLD_SQ = 25; // Speed squared required to trigger kinetic reactions (Reduced for easier interactions)

// --- VSEPR CONSTANTS (Molecular Geometry) ---
// Controls how strongly atoms are forced into their correct bond angles.
// 1.0 is very stiff, approximating rigid molecular shapes.
const ANGULAR_STIFFNESS = 1.0; 
// How much inertia the central atom has relative to satellites during rotation.
const CENTER_MASS_MULTIPLIER = 20.0; 

// Set of Atomic Numbers (Z) that act as covalent non-metals in this simulation.
// VSEPR geometry logic is only applied to these elements.
const COVALENT_Z = new Set([
    1, 2, // H, He
    5, 6, 7, 8, 9, 10, // B, C, N, O, F, Ne
    14, 15, 16, 17, 18, // Si, P, S, Cl, Ar
    33, 34, 35, 36, // As, Se, Br, Kr
    52, 53, 54, // Te, I, Xe
    85, 86 // At, Rn
]);

// --- VSEPR HELPER FUNCTIONS ---

/**
 * Calculates Valence Electrons based on Group Number.
 * This is essential for determining Lone Pairs (LPs).
 * Formula: LP = (ValenceElectrons - BondsUsed) / 2
 */
const getValenceElectrons = (z: number): number | null => {
    if (z === 1) return 1;
    if (z === 2) return 2; 
    if (z >= 3 && z <= 10) return z - 2; // e.g., C(6) -> 4, O(8) -> 6
    if (z >= 11 && z <= 18) return z - 10;
    if (z >= 19 && z <= 20) return z - 18;
    // Transition metals simplified for p-block focus
    if (z >= 31 && z <= 36) return z - 28;
    if (z >= 37 && z <= 38) return z - 36;
    if (z >= 49 && z <= 54) return z - 46;
    if (z >= 55 && z <= 56) return z - 54;
    return null;
};

/**
 * Determines the ideal bond angle based on Steric Number (Domains).
 * Domains = Bonded Atoms + Lone Pairs.
 */
const getTargetGeometry = (bondCount: number, lp: number) => {
    const domains = bondCount + lp;

    // Linear (e.g., CO2, BeCl2)
    if (domains === 2) return { angle: Math.PI, loop: true }; 

    // Trigonal Planar Family
    if (domains === 3) {
        if (lp === 0) return { angle: (2 * Math.PI) / 3, loop: true }; // 120° (BF3)
        return { angle: (118 * Math.PI) / 180, loop: false }; // Bent <120° (SO2, Ozone O=O-O)
    }

    // Tetrahedral Family
    if (domains === 4) {
        if (lp === 0) return { angle: Math.PI / 2, loop: true }; // 90° projected (CH4)
        if (lp === 1) return { angle: (107 * Math.PI) / 180, loop: false }; // Trigonal Pyramidal (NH3)
        return { angle: (104.5 * Math.PI) / 180, loop: false }; // Bent <<109.5° (H2O, O-O-O)
    }

    // Expanded Octets (simplified 2D projections)
    if (domains === 5) return { angle: (72 * Math.PI) / 180, loop: true }; // Pentagonal
    if (domains === 6) return { angle: Math.PI / 3, loop: true }; // Hexagonal

    // Fallback for weird clusters
    return { angle: (2 * Math.PI) / (bondCount || 1), loop: true };
};

/**
 * Canvas Component
 * 
 * The heart of the physics engine. It handles:
 * 1. Rendering loop (requestAnimationFrame).
 * 2. Integration loop (Velocity Verlet / Euler hybrid).
 * 3. Interaction logic (Drag/Drop/Click).
 */
const Canvas: React.FC<CanvasProps> = ({
  timeScale,
  isPlaying,
  clearTrigger,
  spawnRequest
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Mutable state for physics bodies to avoid React render cycle overhead
  const atomsRef = useRef<Atom[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  
  // Interaction state
  const mouseRef = useRef({ 
      x: 0, y: 0, 
      lastX: 0, lastY: 0,
      vx: 0, vy: 0, 
      isDown: false, 
      dragId: null as string | null,
      hoverId: null as string | null,
      // Stores IDs of the entire molecule currently being dragged for highlighting
      dragGroup: new Set<string>() 
  });
  const rafRef = useRef<number>(0);

  // --- LIFECYCLE HANDLERS ---

  // Clear Board
  useEffect(() => {
    if (clearTrigger > 0) {
      atomsRef.current = [];
      particlesRef.current = [];
    }
  }, [clearTrigger]);

  // Handle Drop/Spawn Events
  useEffect(() => {
    if (spawnRequest && canvasRef.current) {
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;
        // Spawn near center with slight random offset to prevent stacking
        const x = width / 2 + (Math.random() - 0.5) * 100;
        const y = height / 2 + (Math.random() - 0.5) * 100;
        spawnAtom(x, y, spawnRequest.z, spawnRequest.isoIndex);
    }
  }, [spawnRequest]);

  // Atom Factory
  const spawnAtom = useCallback((x: number, y: number, z: number, isoIdx: number) => {
    const elem = ELEMENTS.find(e => e.z === z);
    if (!elem) return;

    const iso = elem.iso[isoIdx];
    const mass = iso.m;
    // Radius heuristic: Mass roughly corresponds to volume -> cube root relation
    const radius = 10 + Math.pow(mass, 0.33) * 3;
    
    const newAtom: Atom = {
      id: Math.random().toString(36).substr(2, 9),
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      element: elem,
      isotopeIndex: isoIdx,
      bonds: [],
      mass,
      radius,
      lastDecayCheck: Date.now()
    };
    
    atomsRef.current.push(newAtom);
  }, []);

  // Particle System (Explosions/Decay effects)
  const createExplosion = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      particlesRef.current.push({
        id: Math.random().toString(36),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0, // Alpha value 1.0 -> 0.0
        maxLife: 1.0,
        color: color,
        size: Math.random() * 3 + 1
      });
    }
  };

  // --- BOND MANAGEMENT HELPERS ---

  const addBond = (a: Atom, b: Atom) => {
      a.bonds.push(b.id);
      b.bonds.push(a.id);
  };

  const breakBond = (a: Atom, bId: string) => {
      a.bonds = a.bonds.filter(id => id !== bId);
      const b = atomsRef.current.find(at => at.id === bId);
      if (b) {
          b.bonds = b.bonds.filter(id => id !== a.id);
      }
  };

  const getBondOrder = (a: Atom, bId: string) => {
      let count = 0;
      for (const id of a.bonds) {
          if (id === bId) count++;
      }
      return count;
  };

  // Traverse bonds to find all atoms connected to startId (BFS)
  const getMoleculeGroup = (startId: string): Set<string> => {
      const group = new Set<string>();
      const queue = [startId];
      group.add(startId);

      while (queue.length > 0) {
          const currentId = queue.shift()!;
          const currentAtom = atomsRef.current.find(a => a.id === currentId);
          if (currentAtom) {
              for (const neighborId of currentAtom.bonds) {
                  if (!group.has(neighborId)) {
                      group.add(neighborId);
                      queue.push(neighborId);
                  }
              }
          }
      }
      return group;
  };

  // --- MAIN PHYSICS LOOP ---
  const update = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Mouse Momentum (for "throwing" atoms)
    const mouseDx = mouseRef.current.x - mouseRef.current.lastX;
    const mouseDy = mouseRef.current.y - mouseRef.current.lastY;
    mouseRef.current.lastX = mouseRef.current.x;
    mouseRef.current.lastY = mouseRef.current.y;
    
    const alpha = 0.3; // Low-pass filter for mouse velocity
    mouseRef.current.vx = mouseRef.current.vx * (1 - alpha) + mouseDx * alpha;
    mouseRef.current.vy = mouseRef.current.vy * (1 - alpha) + mouseDy * alpha;

    // Handle user dragging an atom (and its bonded molecule)
    if (mouseRef.current.isDown && mouseRef.current.dragId) {
        // Drag logic is now handled in the Integration phase, 
        // but we ensure the cursor matches.
    }

    // Cursor Logic
    if (mouseRef.current.isDown) canvas.style.cursor = 'grabbing';
    else if (mouseRef.current.hoverId) canvas.style.cursor = 'grab';
    else canvas.style.cursor = 'default';

    if (isPlaying) {
      // 1. UPDATE PARTICLES
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) particlesRef.current.splice(i, 1);
      }

      // 2. RADIOACTIVE DECAY LOGIC
      const frameDt = 0.016 * timeScale;
      
      for (let i = atomsRef.current.length - 1; i >= 0; i--) {
        const atom = atomsRef.current[i];
        const iso = atom.element.iso[atom.isotopeIndex];
        
        if (iso.hl !== "stable") {
           // P(decay) = 1 - 2^(-t / t_half)
           const prob = 1 - Math.pow(2, -frameDt / iso.hl);
           
           if (Math.random() < prob) {
             const productData = iso.p;
             if (productData) {
                createExplosion(atom.x, atom.y, iso.mode === 'alpha' ? '#FFD700' : '#00BFFF', 20);
                
                const productElement = ELEMENTS.find(e => e.z === productData.z);
                
                if (productElement) {
                    let productIsoIdx = productElement.iso.findIndex(iso => Math.abs(iso.m - productData.m) < 0.1);
                    if (productIsoIdx === -1) productIsoIdx = 0;

                    const kick = 3; 
                    const angle = Math.random() * Math.PI * 2;
                    
                    atom.element = productElement;
                    atom.isotopeIndex = productIsoIdx;
                    atom.mass = productElement.iso[productIsoIdx].m;
                    atom.radius = 10 + Math.pow(atom.mass, 0.33) * 3;
                    atom.vx += Math.cos(angle) * kick;
                    atom.vy += Math.sin(angle) * kick;
                    
                    atom.bonds.forEach(bondedId => {
                        const partner = atomsRef.current.find(a => a.id === bondedId);
                        if (partner) partner.bonds = partner.bonds.filter(bid => bid !== atom.id);
                    });
                    atom.bonds = [];
                } else {
                    atomsRef.current.splice(i, 1);
                }
             }
           }
        }
      }

      const atomCount = atomsRef.current.length;

      // 3. PHYSICS SUBSTEPS (Stability Loop)
      for (let step = 0; step < SUBSTEPS; step++) {
          
          // A. Mouse Drag Force 
          // Applies velocity to the dragged atom. Bonds will naturally pull the rest.
          if (mouseRef.current.isDown && mouseRef.current.dragId) {
              const a = atomsRef.current.find(atom => atom.id === mouseRef.current.dragId);
              if (a) {
                  // Direct position manipulation is too jittery for molecules.
                  // Spring force towards mouse is better.
                  const k = 0.2; // Mouse strength
                  a.vx += (mouseRef.current.x - a.x) * k;
                  a.vy += (mouseRef.current.y - a.y) * k;
                  // Damping to prevent orbiting the mouse
                  a.vx *= 0.8;
                  a.vy *= 0.8;
              }
          }

          // B. VSEPR - MOLECULAR GEOMETRY
          for (let i = 0; i < atomCount; i++) {
            const a = atomsRef.current[i];
            const uniqueBondIds = [...new Set(a.bonds)];
            const neighborCount = uniqueBondIds.length;

            if (COVALENT_Z.has(a.element.z) && neighborCount >= 2) {
                const Ve = getValenceElectrons(a.element.z);
                
                if (Ve !== null) {
                    const bondOrderSum = a.bonds.length; 
                    const electronsFree = Ve - bondOrderSum;
                    let lp = Math.floor(electronsFree / 2);
                    if (lp < 0) lp = 0;

                    let { angle: targetRad, loop: isClosed } = getTargetGeometry(neighborCount, lp);

                    const neighbors = uniqueBondIds.map(id => atomsRef.current.find(x => x.id === id)).filter(Boolean) as Atom[];
                    
                    const predXa = a.x + a.vx;
                    const predYa = a.y + a.vy;

                    const sortedNeighbors = neighbors.map(n => ({
                        atom: n,
                        angle: Math.atan2((n.y + n.vy) - predYa, (n.x + n.vx) - predXa),
                    })).sort((p, q) => p.angle - q.angle);

                    for (let j = 0; j < sortedNeighbors.length; j++) {
                        if (!isClosed && j === sortedNeighbors.length - 1) continue;

                        const curr = sortedNeighbors[j];
                        const next = sortedNeighbors[(j + 1) % sortedNeighbors.length];

                        let currentAngleDiff = next.angle - curr.angle;
                        if (currentAngleDiff < 0) currentAngleDiff += Math.PI * 2;

                        let diff = currentAngleDiff - targetRad;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        while (diff < -Math.PI) diff += Math.PI * 2;

                        const force = diff * ANGULAR_STIFFNESS;

                        const dx_curr = (curr.atom.x + curr.atom.vx) - predXa;
                        const dy_curr = (curr.atom.y + curr.atom.vy) - predYa;
                        const dist_curr = Math.sqrt(dx_curr*dx_curr + dy_curr*dy_curr) || 1;
                        
                        const dx_next = (next.atom.x + next.atom.vx) - predXa;
                        const dy_next = (next.atom.y + next.atom.vy) - predYa;
                        const dist_next = Math.sqrt(dx_next*dx_next + dy_next*dy_next) || 1;

                        const tx_curr = -dy_curr / dist_curr;
                        const ty_curr = dx_curr / dist_curr;
                        const tx_next = -dy_next / dist_next;
                        const ty_next = dx_next / dist_next;

                        const fx_curr = tx_curr * force;
                        const fy_curr = ty_curr * force;
                        const fx_next = -tx_next * force; 
                        const fy_next = -ty_next * force;

                        const invMassCurr = (mouseRef.current.dragId === curr.atom.id) ? 0 : 1.0 / curr.atom.mass;
                        const invMassNext = (mouseRef.current.dragId === next.atom.id) ? 0 : 1.0 / next.atom.mass;
                        const invMassCenter = (mouseRef.current.dragId === a.id) ? 0 : 1.0 / (a.mass * CENTER_MASS_MULTIPLIER);

                        curr.atom.vx += fx_curr * invMassCurr;
                        curr.atom.vy += fy_curr * invMassCurr;

                        next.atom.vx += fx_next * invMassNext;
                        next.atom.vy += fy_next * invMassNext;

                        a.vx -= (fx_curr + fx_next) * invMassCenter;
                        a.vy -= (fy_curr + fy_next) * invMassCenter;
                    }
                }
            }
          }

          // C. ATOM-ATOM INTERACTIONS (Bonds, Collisions, Reactions)
          for (let i = 0; i < atomCount; i++) {
            const a = atomsRef.current[i];
            
            for (let j = i + 1; j < atomCount; j++) {
                const b = atomsRef.current[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distSq = dx*dx + dy*dy;
                const combinedRadius = a.radius + b.radius;
                
                const bondOrder = getBondOrder(a, b.id);
                const isBonded = bondOrder > 0;

                // Optimization
                if (!isBonded && distSq > (combinedRadius * 3)**2) continue;
                const dist = Math.sqrt(distSq) || 0.001;

                // Break bond if stretched
                if (isBonded && dist > combinedRadius * 12) {
                    breakBond(a, b.id);
                    continue;
                }

                const nx = dx / dist;
                const ny = dy / dist;

                const invMassA = (mouseRef.current.dragId === a.id) ? 0 : 1 / a.mass;
                const invMassB = (mouseRef.current.dragId === b.id) ? 0 : 1 / b.mass;
                
                if (invMassA + invMassB === 0) continue;

                // --- 1. BOND FORCES ---
                if (isBonded) {
                    const restLengthScale = 0.9 - ((bondOrder - 1) * 0.12);
                    const restLength = combinedRadius * restLengthScale; 
                    const displacement = dist - restLength;
                    
                    const rvx = b.vx - a.vx;
                    const rvy = b.vy - a.vy;
                    const vRelNormal = rvx * nx + rvy * ny;

                    const force = (displacement * BOND_STIFFNESS * bondOrder) + (vRelNormal * BOND_DAMPING);

                    const fx = nx * force;
                    const fy = ny * force;

                    a.vx += fx * invMassA;
                    a.vy += fy * invMassA;
                    b.vx -= fx * invMassB;
                    b.vy -= fy * invMassB;
                } 
                // --- 2. COLLISION FORCES ---
                else if (dist < combinedRadius) {
                    const overlap = combinedRadius - dist;
                    const springForce = overlap * 0.15;

                    const rvx = b.vx - a.vx;
                    const rvy = b.vy - a.vy;
                    const vNormal = rvx * nx + rvy * ny;
                    
                    let dampForce = 0;
                    if (vNormal < 0) {
                        dampForce = vNormal * 0.1;
                    }

                    const totalF = springForce + dampForce;
                    const fx = -nx * totalF;
                    const fy = -ny * totalF;

                    a.vx += fx * invMassA;
                    a.vy += fy * invMassA;
                    b.vx -= fx * invMassB;
                    b.vy -= fy * invMassB;
                }

                // --- 3. CHEMISTRY LOGIC ---
                
                // 3A. Simple Bonding (Low Energy / standard)
                if (dist < combinedRadius * 1.25) {
                    const aMax = COVALENT_Z.has(a.element.z) ? a.element.v : 6; 
                    const bMax = COVALENT_Z.has(b.element.z) ? b.element.v : 6;
                    
                    const aFree = aMax - a.bonds.length;
                    const bFree = bMax - b.bonds.length;
                    
                    if (bondOrder < 3 && aFree > 0 && bFree > 0) {
                        // GENERAL RING STRAIN CHECK
                        // Before forming a bond between A and B, check if they share a neighbor C.
                        // If they do, this forms a 3-member ring (triangle).
                        // If C's preferred VSEPR geometry requires angles > ~85 degrees,
                        // forcing it into a 60-degree triangle causes massive strain. We block this.
                        
                        const commonNeighborId = a.bonds.find(id => b.bonds.includes(id));
                        let isStrained = false;

                        if (commonNeighborId) {
                            const c = atomsRef.current.find(at => at.id === commonNeighborId);
                            if (c) {
                                // Calculate C's ideal geometry state
                                const Ve = getValenceElectrons(c.element.z) || 0;
                                // We are checking existing configuration of C
                                const bondCount = c.bonds.length;
                                const electronsFree = Ve - bondCount;
                                const lp = Math.max(0, Math.floor(electronsFree / 2));
                                const { angle: idealAngle } = getTargetGeometry(bondCount, lp);

                                // 60 degrees is ~1.05 radians.
                                // If ideal angle > 85 degrees (~1.48 radians), blocking the triangle.
                                // This effectively blocks Ozone triangles (want >104) and Cyclopropane logic 
                                // (unless specific hybridizations were supported, which they aren't here).
                                if (idealAngle > 1.48) {
                                    isStrained = true;
                                }
                            }
                        }

                        if (!isStrained) {
                            addBond(a, b);
                        }
                    }
                    
                    // 3B. KINETIC REACTION: High Energy Insertion
                    // Logic: If A slams into B, and A is unbonded but B is bonded,
                    // A can "insert" itself into B's molecule if A has 2+ free slots.
                    // Example: O (Speedy) hits H (in H-H). O inserts to make H-O-H.
                    
                    const rvx = b.vx - a.vx;
                    const rvy = b.vy - a.vy;
                    const vRelSq = rvx*rvx + rvy*rvy;

                    if (!isBonded && vRelSq > REACTION_THRESHOLD_SQ) {
                        // Attempt Reaction: A hitting B
                        const attemptInsertion = (incoming: Atom, target: Atom) => {
                            const inMax = COVALENT_Z.has(incoming.element.z) ? incoming.element.v : 6;
                            const inFree = inMax - incoming.bonds.length;
                            
                            // Condition 1: Incoming atom needs at least 2 free slots to bridge
                            if (inFree < 2) return;

                            // Condition 2: Target is bonded to exactly one other atom (simple end of chain)
                            // We simplify this to prevent destroying complex rings.
                            const targetPartnerId = target.bonds[0];
                            if (!targetPartnerId) return; // Target is alone, standard bonding handles this

                            // Get the third atom (C)
                            const partner = atomsRef.current.find(at => at.id === targetPartnerId);
                            if (!partner) return;

                            // Condition 3: Check if Incoming atom can physically reach Partner
                            // (If the bond is B-C, and A hits B, C might be far away, but usually it's close)
                            const pdx = partner.x - incoming.x;
                            const pdy = partner.y - incoming.y;
                            const pDistSq = pdx*pdx + pdy*pdy;
                            
                            // If partner is reasonably close (within 3 radii), proceed
                            if (pDistSq < (incoming.radius + partner.radius * 3)**2) {
                                // EXECUTE REACTION: Insertion
                                // Break B-C
                                breakBond(target, partner.id);
                                
                                // Form A-B
                                addBond(incoming, target);
                                
                                // Form A-C
                                addBond(incoming, partner);
                                
                                // Visual Flare
                                createExplosion(incoming.x, incoming.y, '#ffffff', 5);
                                
                                // Dampen energy (Conservation of energy -> chemical potential)
                                incoming.vx *= 0.1; incoming.vy *= 0.1;
                                target.vx *= 0.1; target.vy *= 0.1;
                                partner.vx *= 0.1; partner.vy *= 0.1;
                            }
                        };

                        // Try both directions (A hitting B, or B hitting A)
                        attemptInsertion(a, b);
                        attemptInsertion(b, a);
                    }
                }
            }
          }

          // 4. INTEGRATION
          for (let i = 0; i < atomCount; i++) {
              const a = atomsRef.current[i];

              // If dragging, we use velocity control above, but we still integrate position
              // to allow physics solver to resolve constraints.
              
              // Apply Global Drag
              a.vx *= DRAG_COEFF;
              a.vy *= DRAG_COEFF;

              // Velocity Cap
              const speedSq = a.vx*a.vx + a.vy*a.vy;
              if (speedSq > MAX_SPEED*MAX_SPEED) {
                  const scale = MAX_SPEED / Math.sqrt(speedSq);
                  a.vx *= scale;
                  a.vy *= scale;
              }

              // Euler Integration
              a.x += a.vx;
              a.y += a.vy;

              // Wall Bounding Box
              const restitution = 0.5;
              if (a.x < a.radius) { a.x = a.radius; a.vx = Math.abs(a.vx) * restitution; }
              else if (a.x > width - a.radius) { a.x = width - a.radius; a.vx = -Math.abs(a.vx) * restitution; }
              if (a.y < a.radius) { a.y = a.radius; a.vy = Math.abs(a.vy) * restitution; }
              else if (a.y > height - a.radius) { a.y = height - a.radius; a.vy = -Math.abs(a.vy) * restitution; }
          }
      }
    }

    // --- RENDERING PHASE ---
    ctx.fillStyle = '#0b0f19'; 
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = "round";
    
    // Draw Bonds
    atomsRef.current.forEach(a => {
        const uniquePartners = [...new Set(a.bonds)];
        uniquePartners.forEach(bid => {
            const b = atomsRef.current.find(atom => atom.id === bid);
            if (b && a.id < b.id) { 
                const isCovalent = COVALENT_Z.has(a.element.z) && COVALENT_Z.has(b.element.z);
                const order = getBondOrder(a, bid);

                ctx.strokeStyle = isCovalent ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
                ctx.lineWidth = Math.min(a.radius, b.radius) * 0.4;
                
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                const nx = -dy / dist;
                const ny = dx / dist;
                const offset = 3; 

                if (order === 1) {
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                } else if (order === 2) {
                    ctx.lineWidth *= 0.6;
                    ctx.beginPath();
                    ctx.moveTo(a.x + nx * offset, a.y + ny * offset);
                    ctx.lineTo(b.x + nx * offset, b.y + ny * offset);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(a.x - nx * offset, a.y - ny * offset);
                    ctx.lineTo(b.x - nx * offset, b.y - ny * offset);
                    ctx.stroke();
                } else if (order >= 3) {
                    ctx.lineWidth *= 0.5;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(a.x + nx * offset * 1.5, a.y + ny * offset * 1.5);
                    ctx.lineTo(b.x + nx * offset * 1.5, b.y + ny * offset * 1.5);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(a.x - nx * offset * 1.5, a.y - ny * offset * 1.5);
                    ctx.lineTo(b.x - nx * offset * 1.5, b.y - ny * offset * 1.5);
                    ctx.stroke();
                }
            }
        });
    });

    // Draw Atoms
    atomsRef.current.forEach(a => {
        // Selection Halo Logic
        // We check if the atom is in the dragged molecule group OR is the hovered one
        const isDraggedGroup = mouseRef.current.dragGroup.has(a.id);
        const isHovered = mouseRef.current.hoverId === a.id;
        
        // Pseudo-3D shading
        const grad = ctx.createRadialGradient(a.x, a.y, a.radius * 0.5, a.x, a.y, a.radius * 2.0);
        grad.addColorStop(0, a.element.c);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.radius * 2.0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
        ctx.fillStyle = a.element.c;
        ctx.fill();
        
        // Specular highlight
        ctx.beginPath();
        ctx.arc(a.x - a.radius*0.3, a.y - a.radius*0.3, a.radius*0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();

        // Label
        if (a.radius > 8) {
            ctx.fillStyle = '#000';
            ctx.font = `bold ${Math.max(9, a.radius * 0.6)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(a.element.s, a.x, a.y);
            
            if (a.radius > 15) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.font = `${Math.max(7, a.radius * 0.3)}px Inter, sans-serif`;
                ctx.fillText(Math.round(a.mass).toString(), a.x, a.y + a.radius * 0.55);
            }
        }
        
        // Render Halo
        if (isDraggedGroup || isHovered) {
            ctx.strokeStyle = isDraggedGroup ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.radius + 4, 0, Math.PI * 2);
            ctx.stroke();
            
            // If dragged group, add a secondary glow
            if (isDraggedGroup) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(a.x, a.y, a.radius + 8, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    });

    // Draw Particles
    particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    rafRef.current = requestAnimationFrame(update);
  }, [isPlaying, timeScale]);

  // --- EVENTS & SETUP ---

  useEffect(() => {
    rafRef.current = requestAnimationFrame(update);
    return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  }, [update]);

  const getPointerPos = (e: React.PointerEvent | React.MouseEvent | React.DragEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
  }

  const handlePointerDown = (e: React.PointerEvent) => {
      e.preventDefault();
      const { x, y } = getPointerPos(e);

      let clickedId = null;
      for (let i = atomsRef.current.length - 1; i >= 0; i--) {
          const a = atomsRef.current[i];
          const dx = a.x - x;
          const dy = a.y - y;
          if (dx*dx + dy*dy < (a.radius * 1.5) ** 2) { 
              clickedId = a.id;
              break;
          }
      }

      if (clickedId) {
          mouseRef.current.isDown = true;
          mouseRef.current.dragId = clickedId;
          mouseRef.current.x = x;
          mouseRef.current.y = y;
          mouseRef.current.lastX = x;
          mouseRef.current.lastY = y;
          mouseRef.current.vx = 0;
          mouseRef.current.vy = 0;
          
          // Calculate connected molecule for highlighting
          mouseRef.current.dragGroup = getMoleculeGroup(clickedId);
          
          (e.target as Element).setPointerCapture(e.pointerId);
      }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      e.preventDefault();
      const { x, y } = getPointerPos(e);
      mouseRef.current.x = x;
      mouseRef.current.y = y;

      if (!mouseRef.current.isDown) {
          let hoverId = null;
          for (let i = atomsRef.current.length - 1; i >= 0; i--) {
              const a = atomsRef.current[i];
              const dx = a.x - x;
              const dy = a.y - y;
              if (dx*dx + dy*dy < (a.radius * 1.5) ** 2) {
                  hoverId = a.id;
                  break;
              }
          }
          mouseRef.current.hoverId = hoverId;
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      e.preventDefault();
      mouseRef.current.isDown = false;
      mouseRef.current.dragId = null;
      mouseRef.current.dragGroup.clear(); // Clear the highlight group
      (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const { x, y } = getPointerPos(e);
      const clickedIndex = atomsRef.current.findIndex(a => {
        const dx = a.x - x;
        const dy = a.y - y;
        return (dx*dx + dy*dy) < (a.radius ** 2);
      });

      if (clickedIndex !== -1) {
          const atom = atomsRef.current[clickedIndex];
          createExplosion(atom.x, atom.y, '#ffffff', 10);
          atomsRef.current.splice(clickedIndex, 1);
          atomsRef.current.forEach(a => {
              a.bonds = a.bonds.filter(id => id !== atom.id);
          });
      }
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const { x, y } = getPointerPos(e);
      try {
        const dataStr = e.dataTransfer.getData('application/json');
        if (dataStr) {
            const data = JSON.parse(dataStr);
            spawnAtom(x, y, data.z, data.isoIndex);
        }
      } catch (err) {
          console.error("Drop error", err);
      }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // Resize Observer to handle window changes
  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      
      const updateSize = () => {
          if (canvas.parentElement) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
          }
      };
      
      updateSize();

      const resizeObserver = new ResizeObserver(() => {
          window.requestAnimationFrame(() => {
              updateSize();
          });
      });
      
      resizeObserver.observe(canvas.parentElement);
      return () => resizeObserver.disconnect();
  }, []);

  return (
    <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={handleContextMenu}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="w-full h-full touch-none block select-none"
    />
  );
};

export default Canvas;
