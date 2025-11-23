
import { Atom, Particle } from '../types';
import { ELEMENTS } from '../constants';
import { COVALENT_Z, MAX_SPEED, BOND_STIFFNESS, BOND_DAMPING, REACTION_THRESHOLD_SQ } from './constants';
import { addBond, breakBond, decrementBond, getBondOrder } from './utils';
import { getTargetGeometry } from './vsepr';

/**
 * simulation/chemistry.ts
 * 
 * The Core "Chemistry Engine".
 * 
 * This file handles the logic for:
 * 1. Annealing: Correcting bad bond configurations (Local Minima).
 * 2. Interactions: Resolving forces, collisions, and chemical reactions.
 * 3. Decay: Handling nuclear half-lives and transmutation.
 */

// --- Particle Effects ---

export const createExplosion = (particles: Particle[], x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      particles.push({
        id: Math.random().toString(36),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 1.0,
        color: color,
        size: Math.random() * 3 + 1
      });
    }
};

// --- Layer 1: Annealing (Error Correction) ---

/**
 * Intelligently reconfigures bonds to escape local minima.
 */
export const annealAtoms = (atoms: Atom[], dragGroup: Set<string> | null = null) => {
    const atomCount = atoms.length;
    for (let i = 0; i < atomCount; i++) {
        const a = atoms[i];
        if (a.bonds.length === 0) continue;

        if (dragGroup && dragGroup.has(a.id)) continue;

        // RULE 1: HOMONUCLEAR RECONFIGURATION
        const homonuclearBondId = a.bonds.find(bid => {
            const b = atoms.find(x => x.id === bid);
            return b && b.element.z === a.element.z;
        });

        if (homonuclearBondId) {
            const myValency = COVALENT_Z.has(a.element.z) ? a.element.v : 6;
            
            if (myValency <= 2) { 
                const betterHub = atoms.find(c => {
                    if (c.id === a.id || c.id === homonuclearBondId || a.bonds.includes(c.id)) return false;
                    const cMax = COVALENT_Z.has(c.element.z) ? c.element.v : 6;
                    
                    if (cMax <= myValency) return false; 
                    if (c.bonds.length >= cMax) return false; 

                    const dx = c.x - a.x;
                    const dy = c.y - a.y;
                    return (dx*dx + dy*dy < (a.radius * 4.5) ** 2);
                });

                if (betterHub) {
                    breakBond(atoms, a, homonuclearBondId);
                    
                    const dx = betterHub.x - a.x;
                    const dy = betterHub.y - a.y;
                    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    a.vx += (dx/dist) * 10.0;
                    a.vy += (dy/dist) * 10.0;

                    const old = atoms.find(x => x.id === homonuclearBondId);
                    if (old) {
                        const odx = a.x - old.x;
                        const ody = a.y - old.y;
                        const odist = Math.sqrt(odx*odx + ody*ody) || 1;
                        a.vx += (odx/odist) * 5.0;
                        a.vy += (ody/odist) * 5.0;
                    }
                    continue; 
                }
            }
        }

        // RULE 2: ACIDIC HYDROGEN CORRECTION
        if (a.element.z === 1) { 
             const partnerId = a.bonds[0];
             const partner = atoms.find(p => p.id === partnerId);
             
             if (partner && partner.element.v >= 5) {
                  let bestOxygen = atoms.find(o => {
                      if (o.element.z !== 8) return false;
                      if (o.id === partnerId) return false;
                      if (o.bonds.length >= o.element.v) return false; 
                      if (!o.bonds.includes(partnerId)) return false; 
                      return true;
                  });

                  if (!bestOxygen) {
                       bestOxygen = atoms.find(o => {
                           if (o.element.z !== 8) return false;
                           if (o.id === partnerId) return false;
                           if (o.bonds.length >= o.element.v) return false;
                           const dx = o.x - a.x;
                           const dy = o.y - a.y;
                           const searchRadius = Math.max(a.radius * 10, 120);
                           return (dx*dx + dy*dy < searchRadius * searchRadius);
                       });
                  }

                  if (bestOxygen) {
                       breakBond(atoms, a, partnerId);
                       const dx = bestOxygen.x - a.x;
                       const dy = bestOxygen.y - a.y;
                       const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                       const speed = MAX_SPEED; 
                       a.vx = (dx/dist) * speed; 
                       a.vy = (dy/dist) * speed;
                  }
             }
        }
    }
};

// --- Layer 2: Interactions (Physics & Chemistry) ---

export const resolveInteractions = (atoms: Atom[], particles: Particle[], dragId: string | null, dragGroup: Set<string> | null) => {
    const atomCount = atoms.length;
    for (let i = 0; i < atomCount; i++) {
        const a = atoms[i];
        
        for (let j = i + 1; j < atomCount; j++) {
            const b = atoms[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distSq = dx*dx + dy*dy;
            const combinedRadius = a.radius + b.radius;
            
            const bondOrder = getBondOrder(a, b.id);
            const isBonded = bondOrder > 0;

            if (!isBonded && distSq > (combinedRadius * 3)**2) continue;
            const dist = Math.sqrt(distSq) || 0.001;

            const isBondProtected = dragGroup ? (dragGroup.has(a.id) && dragGroup.has(b.id)) : false;
            const isReactionBlocked = dragGroup ? (dragGroup.has(a.id) || dragGroup.has(b.id)) : false;
            
            if (!isBondProtected && isBonded && dist > combinedRadius * 12) {
                breakBond(atoms, a, b.id);
                continue;
            }

            const aMax = COVALENT_Z.has(a.element.z) ? a.element.v : 6;
            if (a.bonds.length > aMax) {
                 breakBond(atoms, a, b.id); 
                 continue;
            }

            const nx = dx / dist;
            const ny = dy / dist;

            const invMassA = (dragId === a.id) ? 0 : 1 / a.mass;
            const invMassB = (dragId === b.id) ? 0 : 1 / b.mass;
            
            if (invMassA + invMassB === 0) continue;

            // 1. BOND FORCES
            if (isBonded) {
                const restLengthScale = 0.9 - ((bondOrder - 1) * 0.12);
                const restLength = combinedRadius * restLengthScale; 
                const displacement = dist - restLength;
                
                const rvx = b.vx - a.vx;
                const rvy = b.vy - a.vy;
                const vRelNormal = rvx * nx + rvy * ny;

                // Tangential Damping (Friction against rotation)
                // Opposes relative motion perpendicular to the bond.
                const tx = -ny;
                const ty = nx;
                const vRelTangent = rvx * tx + rvy * ty;
                
                // Reduced damping to prevent instability
                const rotDamp = 0.05; 

                const springForce = (displacement * BOND_STIFFNESS * bondOrder);
                // Reduced damping to prevent instability
                const dampForce = (vRelNormal * 0.1); 
                const normalTotal = springForce + dampForce;
                
                const tangentTotal = vRelTangent * rotDamp;

                const fx = (nx * normalTotal) + (tx * tangentTotal);
                const fy = (ny * normalTotal) + (ty * tangentTotal);

                a.vx += fx * invMassA;
                a.vy += fy * invMassA;
                b.vx -= fx * invMassB;
                b.vy -= fy * invMassB;
            } 
            // 2. COLLISION FORCES
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

            // 3. CHEMISTRY LOGIC
            if (!isReactionBlocked && dist < combinedRadius * 1.5) {
                const rvx = b.vx - a.vx;
                const rvy = b.vy - a.vy;
                const vRelSq = rvx*rvx + rvy*rvy;

                const aMax = COVALENT_Z.has(a.element.z) ? a.element.v : 6; 
                const bMax = COVALENT_Z.has(b.element.z) ? b.element.v : 6;
                
                const aFree = aMax - a.bonds.length;
                const bFree = bMax - b.bonds.length;
                
                // 3A. Simple Bonding (Low Energy)
                if (bondOrder < 3 && aFree > 0 && bFree > 0) {
                    const hasBetterOption = (subject: Atom, ignoreId: string, minValency: number) => {
                         const searchRadius = Math.max(subject.radius * 8.0, 100);
                         const searchDistSq = searchRadius * searchRadius; 
                         
                         for (let k = 0; k < atomCount; k++) {
                             const c = atoms[k];
                             if (c.id === subject.id || c.id === ignoreId) continue;
                             if (subject.bonds.includes(c.id)) continue; 
                             
                             const cMax = COVALENT_Z.has(c.element.z) ? c.element.v : 6;
                             if (c.bonds.length >= cMax) continue; 
                             if (cMax < minValency) continue;

                             const dx = c.x - subject.x;
                             const dy = c.y - subject.y;
                             if (dx*dx + dy*dy < searchDistSq) return true;
                         }
                         return false;
                    };

                    let isBlocked = false;

                    if (bondOrder === 0) {
                         if (a.element.z === b.element.z) {
                             if (hasBetterOption(a, b.id, bMax + 1)) isBlocked = true;
                             if (hasBetterOption(b, a.id, aMax + 1)) isBlocked = true;
                         }
                         if (!isBlocked) {
                             const aIsH = a.element.z === 1;
                             const bIsH = b.element.z === 1;
                             if (aIsH && b.element.v >= 5) {
                                 if (hasBetterOption(a, b.id, 2)) isBlocked = true;
                             } else if (bIsH && a.element.v >= 5) {
                                 if (hasBetterOption(b, a.id, 2)) isBlocked = true;
                             }
                         }

                    } else {
                         if (hasBetterOption(a, b.id, 1) || hasBetterOption(b, a.id, 1)) {
                             isBlocked = true;
                         }
                    }

                    if (!isBlocked) {
                        const commonNeighborId = a.bonds.find(id => b.bonds.includes(id));
                        let isStrained = false;
                        if (commonNeighborId) {
                            const c = atoms.find(at => at.id === commonNeighborId);
                            if (c) {
                                const Ve = (COVALENT_Z.has(c.element.z) ? c.element.v : null) || 0;
                                const electronsFree = Ve - c.bonds.length;
                                const lp = Math.max(0, Math.floor(electronsFree / 2));
                                const { angle: idealAngle } = getTargetGeometry(c.bonds.length, lp);
                                if (idealAngle > 1.48) isStrained = true;
                            }
                        }

                        if (!isStrained) {
                            addBond(a, b);
                        }
                    }
                }
                // 3B. Kinetic Insertion (High Energy)
                else if (!isBonded && vRelSq > REACTION_THRESHOLD_SQ && aFree >= 2) {
                    if (b.bonds.length === 1) { 
                        const partnerId = b.bonds[0];
                        const partner = atoms.find(at => at.id === partnerId);
                        if (partner) {
                            const pdx = partner.x - a.x;
                            const pdy = partner.y - a.y;
                            if (pdx*pdx + pdy*pdy < (a.radius + partner.radius * 3)**2) {
                                breakBond(atoms, b, partner.id);
                                addBond(a, b);
                                addBond(a, partner);
                                createExplosion(particles, a.x, a.y, '#ffffff', 5);
                                a.vx *= 0.1; a.vy *= 0.1;
                                b.vx *= 0.1; b.vy *= 0.1;
                                partner.vx *= 0.1; partner.vy *= 0.1;
                            }
                        }
                    }
                }
                // 3C. Impact Dissociation (High Energy)
                else if (!isBonded && vRelSq > REACTION_THRESHOLD_SQ) {
                     const tryDissociate = (atom: Atom) => {
                         const maxV = COVALENT_Z.has(atom.element.z) ? atom.element.v : 6;
                         if (atom.bonds.length >= maxV && atom.bonds.length > 0) {
                             const partnerId = atom.bonds[Math.floor(Math.random() * atom.bonds.length)];
                             return decrementBond(atoms, atom, partnerId);
                         }
                         return false;
                     };

                     const aBroken = tryDissociate(a);
                     const bBroken = tryDissociate(b);

                     if (aBroken || bBroken) {
                         createExplosion(particles, (a.x+b.x)/2, (a.y+b.y)/2, '#FFA500', 6);
                         a.vx *= 0.3; a.vy *= 0.3;
                         b.vx *= 0.3; b.vy *= 0.3;
                     }
                }
            }
        }
    }
};

export const processDecay = (atoms: Atom[], particles: Particle[], dt: number) => {
    const count = atoms.length;
    for (let i = 0; i < count; i++) {
        const a = atoms[i];
        const iso = a.element.iso[a.isotopeIndex];
        
        if (iso.hl === 'stable') continue;

        const lambda = 0.693 / (iso.hl as number);
        const p = 1 - Math.exp(-lambda * dt);

        if (Math.random() < p) {
            const color = iso.mode === 'alpha' ? '#FFE066' : '#66E0FF'; 
            createExplosion(particles, a.x, a.y, color, 12);

            if (iso.p) {
                const productZ = iso.p.z;
                const productM = iso.p.m;
                const newElem = ELEMENTS.find(e => e.z === productZ);
                
                if (newElem) {
                    let newIsoIndex = newElem.iso.findIndex(iso => Math.abs(iso.m - productM) < 0.1);
                    if (newIsoIndex === -1) newIsoIndex = 0;

                    a.element = newElem;
                    a.isotopeIndex = newIsoIndex;
                    a.mass = newElem.iso[newIsoIndex].m;
                    a.radius = 10 + Math.pow(a.mass, 0.33) * 3;

                    const angle = Math.random() * Math.PI * 2;
                    const recoil = 20 / a.mass; 
                    a.vx += Math.cos(angle) * recoil * 10;
                    a.vy += Math.sin(angle) * recoil * 10;
                }
            }
        }
    }
};
