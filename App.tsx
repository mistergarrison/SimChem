
import React, { useState, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import PeriodicTable from './components/PeriodicTable';
import { ELEMENTS } from './constants';
import { ElementData, PaletteItem } from './types';

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
  // Slider value 0-100. 50 = 1x.
  const [sliderValue, setSliderValue] = useState(50);
  const [isPlaying, setIsPlaying] = useState(true);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [spawnRequest, setSpawnRequest] = useState<{z: number, isoIndex: number, id: number} | null>(null);

  // Derived timeScale for physics engine
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

  const handleAddAtom = (el: ElementData) => {
      // Default to stable isotope or first one
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

  const handleSpawnAtom = (item: PaletteItem) => {
    setSpawnRequest({
        z: item.element.z,
        isoIndex: item.isotopeIndex,
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
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onSpawnAtom={handleSpawnAtom}
      />
      
      <main className="flex-grow h-full relative bg-neutral-950">
        <Canvas 
            timeScale={timeScale}
            isPlaying={isPlaying}
            onAtomCountChange={() => {}}
            clearTrigger={clearTrigger}
            spawnRequest={spawnRequest}
        />
      </main>

      <PeriodicTable 
        isOpen={isTableOpen}
        onClose={() => setIsTableOpen(false)}
        onSelect={handleAddAtom}
      />
    </div>
  );
};

export default App;
