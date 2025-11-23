
import { Atom } from '../types';
import { COVALENT_Z, ANGULAR_STIFFNESS } from './constants';

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

export const getTargetGeometry = (bondCount: number, lp: number) => {
    const domains = bondCount + lp;
    if (domains === 2) return { angle: Math.PI, loop: true }; 
    if (domains === 3) {
        if (lp === 0) return { angle: (2 * Math.PI) / 3, loop: true }; 
        return { angle: (118 * Math.PI) / 180, loop: false }; 
    }
    if (domains === 4) {
        if (lp === 0) return { angle: Math.PI / 2, loop: true }; 
        if (lp === 1) return { angle: (107 * Math.PI) / 180, loop: false }; 
        return { angle: (104.5 * Math.PI) / 180, loop: false }; 
    }
    if (domains === 5) return { angle: (72 * Math.PI) / 180, loop: true }; 
    if (domains === 6) return { angle: Math.PI / 3, loop: true }; 
    return { angle: (2 * Math.PI) / (bondCount || 1), loop: true };
};

export const applyVSEPR = (atoms: Atom[], dragId: string | null) => {
    const atomCount = atoms.length;
    for (let i = 0; i < atomCount; i++) {
        const a = atoms[i];
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

                const neighbors = uniqueBondIds.map(id => atoms.find(x => x.id === id)).filter(Boolean) as Atom[];
                
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

                    const invMassCurr = (dragId === curr.atom.id) ? 0 : 1.0 / curr.atom.mass;
                    const invMassNext = (dragId === next.atom.id) ? 0 : 1.0 / next.atom.mass;
                    const invMassCenter = (dragId === a.id) ? 0 : 1.0 / a.mass;

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
};
