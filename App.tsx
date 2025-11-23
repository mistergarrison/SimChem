
import React, { useState, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import PeriodicTable from './components/PeriodicTable';
import RecipePicker from './components/RecipePicker';
import { ELEMENTS } from './constants';
import { ElementData, PaletteItem, Recipe } from './types';

/**
 * App.tsx
 * 
 * The Root Container and State Orchestrator.
 * 
 * Architectural Responsibilities:
 * 1. **Global State Management**: Holds the source of truth for the Atom Palette,
 *    Sidebar visibility, and Simulation Parameters (Time Scale).
 * 2. **Layout Composition**: Arranges the Sidebar, Canvas (Main Stage), and Modals
 *    (Periodic Table, Recipe Picker).
 * 3. **Event Bridging**: Acts as the communication hub. It passes callback functions 
 *    that allow UI components to trigger events in the decoupled Canvas component 
 *    (e.g., Spawning atoms, Clearing the board).
 */
const App: React.FC = () => {
  // Initialize palette with Hydrogen, Helium, Carbon, Oxygen, and Uranium-235
  const [palette, setPalette] = useState<PaletteItem[]>([
    { id: 'init-h', element: ELEMENTS[0], isotopeIndex: 0 },
    { id: 'init-he', element: ELEMENTS[1], isotopeIndex: 0 },
    { id: 'init-c', element: ELEMENTS[5], isotopeIndex: 0 },
    { id: 'init-o', element: ELEMENTS[7], isotopeIndex: 0 },
    { id: 'init-u235', element: ELEMENTS[91], isotopeIndex: 1 }
  ]);
  
  const [isTableOpen, setIsTableOpen] = useState(false);
  const [isRecipeOpen, setIsRecipeOpen] = useState(false);
  
  // Slider value 0-100. 50 = 1x real-time speed.
  const [sliderValue, setSliderValue] = useState(50);
  
  // Triggers for Canvas-side effects
  const [clearTrigger, setClearTrigger] = useState(0);
  const [spawnRequest, setSpawnRequest] = useState<{z: number, isoIndex: number, id: number, x?: number, y?: number} | null>(null);
  const [recipeRequest, setRecipeRequest] = useState<{recipe: Recipe, id: number} | null>(null);

  /**
   * Time Scale Calculation
   * 
   * Maps the linear slider input (0-100) to a hybrid linear/logarithmic physics time scale.
   * - 0-50: Linear mapping from 0x (Paused) to 1x (Real-time).
   * - 50-100: Logarithmic mapping from 1x to ~10,000x. 
   *   This allows users to fast-forward through long radioactive half-lives.
   */
  const timeScale = useMemo(() => {
    if (sliderValue <= 50) {
        // 0 to 1x linear
        return sliderValue / 50;
    } else {
        // 1x to 10,000x log
        const power = (sliderValue - 50) / 12.5; 
        return Math.pow(10, power);
    }
  }, [sliderValue]);

  // Pause simulation if slider is at 0
  const isPlaying = sliderValue > 0;

  const handleAddAtom = (el: ElementData) => {
      // Default to stable isotope or first one if no stable version exists
      const stableIndex = el.iso.findIndex(i => i.hl === "stable");
      const idx = stableIndex !== -1 ? stableIndex : 0;
      
      const newItem: PaletteItem = {
          id: Math.random().toString(36).substr(2, 9),
          element: el,
          isotopeIndex: idx
      };
      setPalette(prev => [...prev, newItem]);
  };

  const handleRemoveFromPalette = (id: string) => {
      setPalette(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateIsotope = (id: string, newIndex: number) => {
      setPalette(prev => prev.map(item => 
          item.id === id ? { ...item, isotopeIndex: newIndex } : item
      ));
  };

  // Passes the spawn request to the Canvas via the `spawnRequest` prop/effect
  const handleSpawnAtom = (item: PaletteItem, pos?: {x: number, y: number}) => {
    setSpawnRequest({
        z: item.element.z,
        isoIndex: item.isotopeIndex,
        id: Date.now(),
        x: pos?.x,
        y: pos?.y
    });
  };

  const handleSelectRecipe = (recipe: Recipe) => {
      setRecipeRequest({
          recipe,
          id: Date.now()
      });
  };

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden font-sans">
      <Sidebar 
        palette={palette}
        onAddAtom={() => setIsTableOpen(true)}
        onRemoveFromPalette={handleRemoveFromPalette}
        onUpdateIsotope={handleUpdateIsotope}
        sliderValue={sliderValue}
        setSliderValue={setSliderValue}
        onClear={() => setClearTrigger(prev => prev + 1)}
        onSpawnAtom={handleSpawnAtom}
        onOpenRecipes={() => setIsRecipeOpen(true)}
      />
      
      <main className="flex-grow h-full relative bg-neutral-950">
        <Canvas 
            timeScale={timeScale}
            isPlaying={isPlaying}
            onAtomCountChange={() => {}}
            clearTrigger={clearTrigger}
            spawnRequest={spawnRequest}
            recipeRequest={recipeRequest}
        />
      </main>

      <PeriodicTable 
        isOpen={isTableOpen}
        onClose={() => setIsTableOpen(false)}
        onSelect={handleAddAtom}
      />

      <RecipePicker
        isOpen={isRecipeOpen}
        onClose={() => setIsRecipeOpen(false)}
        onSelect={handleSelectRecipe}
      />
    </div>
  );
};

export default App;