

import { Atom } from '../types';
import { COVALENT_Z, ANGULAR_STIFFNESS } from './constants';

/**
 * simulation/vsepr.ts
 * 
 * Implements the Valence Shell Electron Pair Repulsion (VSEPR) theory.
 * 
 * Goal:
 * Simulate accurate molecular geometry (Linear, Trigonal Planar, Tetrahedral, etc.)
 * by treating electron domains (bonds and lone pairs) as repelling force fields.
 * 
 * Physics Implementation Notes:
 * 1. **Torque-Based Forces**: To prevent the "Phantom Spin" issue common in particle 
 *    simulations, we calculate the corrective Torque required to fix the bond angle, 
 *    then derive the specific tangential Force for each atom based on its bond length ($F = \tau / radius$).
 *    This ensures conservation of Angular Momentum, as the torques applied to the central atom
 *    and its neighbors cancel out perfectly.
 * 
 * 2. **Accumulation Buffer**: To prevent "Order Dependency Drift" (where the first atom processed
 *    moves and affects the calculation for the second atom in the same frame), all VSEPR 
 *    forces are calculated based on the initial frame state, stored in a buffer, and 
 *    applied simultaneously.
 * 
 * Rigid Body Note:
 * This logic is kept active even when molecules are being dragged by the user.
 * This prevents molecules (like Water) from collapsing into a floppy chain 
 * during movement.
 */

/**
 * Returns the number of valence electrons for a given atomic number Z.
 * Simplified for the s and p blocks where VSEPR is most relevant.
 */
const getValenceElectrons = (z: number): number | null => {
    if (z === 1) return 1;
    if (z === 2) return 2; 
    if (z >= 3 && z <= 10) return z - 2; 
    if (z >= 11 && z <= 18) return z - 10;
    if (z >= 19 && z <= 20) return z - 18;
    if (z >= 31 && z <= 36) return z - 28;
    if (z >= 37 && z <= 38) return z - 36;
    if (z >= 49 && z <= 54) return z - 46;
    if (z >= 55 && z <= 56) return z - 54;
    return null;
};

/**
 * Determines the ideal bond angle based on steric number and lone pairs.
 * 
 * @param bondCount Number of atoms bonded to the central atom
 * @param lp Number of lone pairs on the central atom
 * @returns 
 *   angle: The target angle in radians between bonds.
 *   loop: Whether the bonds loop around fully (360) or are constrained to a sector.
 */
export const getTargetGeometry = (bondCount: number, lp: number) => {
    const domains = bondCount + lp;
    
    // Linear (e.g., CO2)
    if (domains === 2) return { angle: Math.PI, loop: true }; 
    
    // Trigonal Planar (e.g., BF3) or Bent (e.g., SO2)
    if (domains === 3) {
        if (lp === 0) return { angle: (2 * Math.PI) / 3, loop: true }; 
        return { angle: (118 * Math.PI) / 180, loop: false }; 
    }
    
    // Tetrahedral (e.g., CH4), Pyramidal (NH3), or Bent (H2O)
    if (domains === 4) {
        if (lp === 0) return { angle: Math.PI / 2, loop: true }; // Projected 109.5 -> 90 in 2D
        if (lp === 1) return { angle: (107 * Math.PI) / 180, loop: false }; 
        return { angle: (104.5 * Math.PI) / 180, loop: false }; 
    }
    
    // Trigonal Bipyramidal (e.g., PCl5)
    if (domains === 5) return { angle: (72 * Math.PI) / 180, loop: true }; 
    
    // Octahedral (e.g., SF6)
    if (domains === 6) return { angle: Math.PI / 3, loop: true }; 
    
    // Fallback for high coordination
    return { angle: (2 * Math.PI) / (bondCount || 1), loop: true };
};

/**
 * Applies angular forces to atoms to enforce VSEPR geometry.
 * 
 * Algorithm:
 * 1. Identify "Neighbors" (bonded atoms).
 * 2. Sort neighbors by their current angular position around the central atom.
 * 3. Calculate the difference between the current angle and the Target Angle.
 * 4. Apply torque (tangential force) to push neighbors toward the target angle.
 * 
 * @param atoms All atoms
 * @param dragGroup The set of Atom IDs currently being dragged. VSEPR remains active for these to ensure rigid movement.
 */
export const applyVSEPR = (atoms: Atom[], dragGroup: Set<string> | null) => {
    // Accumulation buffer to prevent order-dependency bias (Drift/Spin)
    const deltas = new Map<string, {vx: number, vy: number}>();
    const addDelta = (id: string, dx: number, dy: number) => {
        const current = deltas.get(id) || {vx: 0, vy: 0};
        current.vx += dx;
        current.vy += dy;
        deltas.set(id, current);
    };

    const atomCount = atoms.length;
    for (let i = 0; i < atomCount; i++) {
        const a = atoms[i];
        
        const uniqueBondIds = [...new Set(a.bonds)];
        const neighborCount = uniqueBondIds.length;

        // VSEPR only applies if Z is a covalent non-metal and has >= 2 bonds
        if (COVALENT_Z.has(a.element.z) && neighborCount >= 2) {
            const Ve = getValenceElectrons(a.element.z);
            
            if (Ve !== null) {
                // Calculate Lone Pairs (LP) = (Valence - Bonds) / 2
                const bondOrderSum = a.bonds.length; 
                const electronsFree = Ve - bondOrderSum;
                let lp = Math.floor(electronsFree / 2);
                if (lp < 0) lp = 0;

                let { angle: targetRad, loop: isClosed } = getTargetGeometry(neighborCount, lp);

                const neighbors = uniqueBondIds.map(id => atoms.find(x => x.id === id)).filter(Boolean) as Atom[];
                
                // Predicted position helps with stability during movement.
                // Critical: We use the *initial* velocity of the frame for all calculations
                // to ensure consistency.
                const predXa = a.x + a.vx;
                const predYa = a.y + a.vy;

                // Sort neighbors by current angle
                const sortedNeighbors = neighbors.map(n => ({
                    atom: n,
                    angle: Math.atan2((n.y + n.vy) - predYa, (n.x + n.vx) - predXa),
                })).sort((p, q) => p.angle - q.angle);

                // Apply forces between adjacent neighbors in the sort order
                for (let j = 0; j < sortedNeighbors.length; j++) {
                    // If geometry isn't a closed loop (e.g. Water), don't push the first and last neighbor together
                    if (!isClosed && j === sortedNeighbors.length - 1) continue;

                    const curr = sortedNeighbors[j];
                    const next = sortedNeighbors[(j + 1) % sortedNeighbors.length];

                    let currentAngleDiff = next.angle - curr.angle;
                    if (currentAngleDiff < 0) currentAngleDiff += Math.PI * 2;

                    let diff = currentAngleDiff - targetRad;
                    // Normalize diff to [-PI, PI]
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;

                    // Calculates TORQUE, not Force. 
                    // This is critical for angular momentum conservation.
                    const torque = diff * ANGULAR_STIFFNESS;

                    // Tangential vectors for force application
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

                    // Scale Force by 1/r to ensure Torque matches on both arms.
                    // If we applied equal Force, the longer arm would have more torque (r*F),
                    // inducing spin.
                    const forceMagCurr = torque / dist_curr;
                    const forceMagNext = torque / dist_next;

                    const fx_curr = tx_curr * forceMagCurr;
                    const fy_curr = ty_curr * forceMagCurr;
                    const fx_next = -tx_next * forceMagNext; 
                    const fy_next = -ty_next * forceMagNext;

                    // Apply forces (mass weighted) via Accumulator
                    const invMassCurr = 1.0 / curr.atom.mass;
                    const invMassNext = 1.0 / next.atom.mass;
                    const invMassCenter = 1.0 / a.mass;

                    addDelta(curr.atom.id, fx_curr * invMassCurr, fy_curr * invMassCurr);
                    addDelta(next.atom.id, fx_next * invMassNext, fy_next * invMassNext);

                    // Newton's 3rd Law: Central atom feels opposite force (Linear Momentum Conservation)
                    addDelta(a.id, -(fx_curr + fx_next) * invMassCenter, -(fy_curr + fy_next) * invMassCenter);
                }
            }
        }
    }

    // Apply accumulated velocity changes
    deltas.forEach((d, id) => {
        const a = atoms.find(x => x.id === id);
        if (a) {
            a.vx += d.vx;
            a.vy += d.vy;
        }
    });
};
