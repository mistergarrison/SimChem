
export interface MouseState {
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    vx: number;
    vy: number;
    isDown: boolean;
    dragId: string | null;
    hoverId: string | null;
    dragGroup: Set<string>;
    isLassoing: boolean;
    lassoPoints: {x: number, y: number}[];
    recipeHaloLife: number;
    recipeHaloMaxLife: number;
    recipeTarget: { ids: string[], cx: number, cy: number, startRadius?: number } | null;
}
