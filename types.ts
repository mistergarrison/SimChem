
export interface Isotope {
    m: number;
    hl: number | "stable";
    mode?: "alpha" | "beta";
    p?: { z: number; m: number };
    name?: string;
  }
  
  export interface ElementData {
    z: number;
    s: string;
    n: string;
    v: number;
    c: string;
    iso: Isotope[];
  }
  
  export interface Atom {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    element: ElementData;
    isotopeIndex: number;
    bonds: string[]; // IDs of bonded atoms
    mass: number;
    radius: number;
    lastDecayCheck?: number;
  }
  
  export interface Particle {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
  }
  
  export interface SimulationState {
    atoms: Atom[];
    particles: Particle[];
    timeScale: number;
    isPlaying: boolean;
  }

  export interface PaletteItem {
    id: string;
    element: ElementData;
    isotopeIndex: number;
  }

  export interface Recipe {
    id: string;
    name: string;
    formula: string;
    ingredients: { z: number; count: number }[];
  }
