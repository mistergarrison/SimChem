
/**
 * simulation/types.ts
 * 
 * Defines the shared state shapes used across the physics engine, renderer, 
 * and input handlers.
 */

/**
 * Tracks the comprehensive state of user interaction with the Canvas.
 * This acts as the bridge between React events and the physics loop.
 */
export interface MouseState {
    // Current pointer position in Canvas coordinates
    x: number;
    y: number;
    
    // Position in the previous frame (used to calculate pointer velocity)
    lastX: number;
    lastY: number;
    
    // Smoothed velocity of the pointer (for throwing atoms)
    vx: number;
    vy: number;
    
    // Interaction flags
    isDown: boolean;
    dragId: string | null;     // ID of the atom currently being dragged
    hoverId: string | null;    // ID of the atom currently under the cursor
    
    // Set of IDs belonging to the molecule currently being dragged.
    // We track the whole group so visual effects (like halos) apply to the whole molecule.
    dragGroup: Set<string>;
    
    // Lasso Selection State
    isLassoing: boolean;
    lassoPoints: {x: number, y: number}[]; // Polygon path drawn by the user
    
    // Recipe "Gravity Well" State
    // Used to animate the "Super Crunch" effect when spawning recipes or using the Lasso.
    recipeHaloLife: number;    // Remaining duration of the effect (in frames)
    recipeHaloMaxLife: number; // Total duration (for calculating opacity/progress)
    recipeTarget: { 
        ids: string[],         // Atoms affected by the gravity well
        cx: number,            // Center X of the well
        cy: number,            // Center Y of the well
        startRadius?: number   // Initial radius of the visual halo
    } | null;
}
