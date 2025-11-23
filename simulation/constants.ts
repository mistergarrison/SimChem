
// --- SIMULATION CONFIGURATION ---
export const SUBSTEPS = 8; 
export const MAX_SPEED = 20; 

// --- PHYSICS CONSTANTS ---
export const DRAG_COEFF = 0.95; 
export const BOND_STIFFNESS = 0.6; 
export const BOND_DAMPING = 0.2;   
export const REACTION_THRESHOLD_SQ = 20; 

// --- VSEPR CONSTANTS ---
export const ANGULAR_STIFFNESS = 1.0; 

// Set of Atomic Numbers (Z) that act as covalent non-metals
export const COVALENT_Z = new Set([
    1, 2, // H, He
    5, 6, 7, 8, 9, 10, // B, C, N, O, F, Ne
    14, 15, 16, 17, 18, // Si, P, S, Cl, Ar
    33, 34, 35, 36, // As, Se, Br, Kr
    52, 53, 54, // Te, I, Xe
    85, 86 // At, Rn
]);
