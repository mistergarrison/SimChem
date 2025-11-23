
import { Atom } from '../types';

export const isPointInPolygon = (p: {x: number, y: number}, polygon: {x: number, y: number}[]) => {
    let isInside = false;
    let minX = polygon[0].x, maxX = polygon[0].x;
    let minY = polygon[0].y, maxY = polygon[0].y;
    
    for (let i = 1; i < polygon.length; i++) {
        const q = polygon[i];
        minX = Math.min(q.x, minX);
        maxX = Math.max(q.x, maxX);
        minY = Math.min(q.y, minY);
        maxY = Math.max(q.y, maxY);
    }
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (((polygon[i].y > p.y) !== (polygon[j].y > p.y)) &&
            (p.x < (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
            isInside = !isInside;
        }
    }
    return isInside;
};

export const getMoleculeGroup = (allAtoms: Atom[], startId: string): Set<string> => {
    const group = new Set<string>();
    const queue = [startId];
    group.add(startId);

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentAtom = allAtoms.find(a => a.id === currentId);
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

export const addBond = (a: Atom, b: Atom) => {
    a.bonds.push(b.id);
    b.bonds.push(a.id);
};

export const breakBond = (allAtoms: Atom[], a: Atom, bId: string) => {
    a.bonds = a.bonds.filter(id => id !== bId);
    const b = allAtoms.find(at => at.id === bId);
    if (b) {
        b.bonds = b.bonds.filter(id => id !== a.id);
    }
};

export const decrementBond = (allAtoms: Atom[], a: Atom, bId: string) => {
    const indexA = a.bonds.indexOf(bId);
    if (indexA > -1) {
        a.bonds.splice(indexA, 1);
        const b = allAtoms.find(at => at.id === bId);
        if (b) {
            const indexB = b.bonds.indexOf(a.id);
            if (indexB > -1) b.bonds.splice(indexB, 1);
        }
        return true;
    }
    return false;
};

export const getBondOrder = (a: Atom, bId: string) => {
    let count = 0;
    for (const id of a.bonds) {
        if (id === bId) count++;
    }
    return count;
};
