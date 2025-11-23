
import React from 'react';
import { PaletteItem } from '../types';

interface SidebarProps {
  palette: PaletteItem[];
  onAddAtom: () => void;
  onRemoveFromPalette: (id: string) => void;
  onUpdateIsotope: (id: string, newIndex: number) => void;
  sliderValue: number;
  setSliderValue: (v: number) => void;
  onClear: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSpawnAtom: (item: PaletteItem) => void;
}

/**
 * Sidebar Component
 * 
 * Role: The Primary Control Center and Atom Palette.
 * 
 * Architectural Goals:
 * 1. **Precise Palette Management**:
 *    - Unlike standard chemistry sets, this tool is also a *Nuclear Physics* simulator.
 *    - Therefore, the user must be able to select specific **Isotopes** (e.g., U-235 vs U-238).
 *    - The palette cards expose a dropdown to toggle between stable and radioactive variants 
 *      defined in the data source.
 * 
 * 2. **Time Dilation Controls**:
 *    - The simulation spans vast temporal orders of magnitude.
 *    - Molecular vibrations occur in femtoseconds; Radioactive decay can take billions of years.
 *    - We implement a hybrid Linear/Logarithmic slider to give users fine control at 1x speed 
 *      but massive acceleration capabilities for observing decay chains.
 * 
 * 3. **Drag-and-Drop Spawning**:
 *    - Acts as the "Source" for the Canvas "Target".
 *    - Serializes atom data into JSON for transfer to the physics engine.
 */
const Sidebar: React.FC<SidebarProps> = ({
  palette,
  onAddAtom,
  onRemoveFromPalette,
  onUpdateIsotope,
  sliderValue,
  setSliderValue,
  onClear,
  isPlaying,
  onTogglePlay,
  onSpawnAtom
}) => {
  
  /**
   * Time Scale Display Logic
   * 
   * Requirement: Handle dynamic range from 0x (Paused) to 10,000x (Fast Forward).
   * 
   * - 0-50 (Linear): Allows fine-tuning for chemistry/molecular dynamics.
   * - 50-100 (Logarithmic): Ramps up exponentially to allow users to watch
   *   long half-life isotopes (like Carbon-14 or Uranium) decay in real-time.
   */
  const getScaleText = (val: number) => {
      if (val <= 50) return `${(val / 50).toFixed(2)}x`;
      
      // Logarithmic calculation:
      // Input 50 -> 10^0 = 1x
      // Input 100 -> 10^4 = 10,000x
      const power = (val - 50) / 12.5; 
      return `${Math.pow(10, power).toFixed(0)}x`;
  };

  /**
   * Drag Initialization
   * 
   * We serialize the essential physics properties (Atomic Number Z, Isotope Index)
   * into the DataTransfer object. The Canvas component listens for the 'drop' event
   * and reconstructs the full Atom object from this seed data.
   */
  const handleDragStart = (e: React.DragEvent, item: PaletteItem) => {
      const data = {
          z: item.element.z,
          isoIndex: item.isotopeIndex
      };
      e.dataTransfer.setData('application/json', JSON.stringify(data));
      e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="w-[300px] bg-gray-950 border-r border-gray-800 h-screen flex flex-col text-gray-200 shadow-2xl z-20 select-none">
      {/* --- Branding & Header --- */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/50">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          SimChem
        </h1>
        <p className="text-xs text-gray-500">Molecular & Nuclear Physics</p>
      </div>

      {/* --- Global Controls Section --- */}
      <div className="p-5 border-b border-gray-800 space-y-4">
        {/* Time Scale Slider */}
        <div>
            <div className="flex justify-between items-end mb-2">
                <label className="text-xs uppercase text-gray-500 font-bold">Time Scale</label>
                <span className="text-xs font-mono text-blue-400">{getScaleText(sliderValue)}</span>
            </div>
            <input 
                type="range" 
                min="0" 
                max="100" 
                step="1"
                value={sliderValue}
                onChange={(e) => setSliderValue(Number(e.target.value))}
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-colors"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>Paused</span>
                <span>1x</span>
                <span>Max</span>
            </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
             <button
                onClick={onTogglePlay}
                className={`py-2 font-bold rounded border transition-all ${isPlaying ? 'bg-yellow-600/20 border-yellow-600 text-yellow-500 hover:bg-yellow-600/30' : 'bg-green-600/20 border-green-600 text-green-500 hover:bg-green-600/30'}`}
             >
                {isPlaying ? 'Pause' : 'Play'}
             </button>
             <button
                onClick={onClear}
                className="py-2 bg-red-600/10 border border-red-900 hover:bg-red-600/30 text-red-500 font-bold rounded transition-all"
             >
                Clear
             </button>
        </div>
      </div>

      {/* --- Atom Palette Header --- */}
      <div className="p-4 flex justify-between items-center bg-gray-900/30">
        <span className="text-xs uppercase font-bold text-gray-400">Atom Palette</span>
        <button 
            onClick={onAddAtom}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg shadow-blue-900/20 transition-colors"
        >
            + New Atom
        </button>
      </div>

      {/* --- Active Palette List --- */}
      {/* 
          This list contains the "cards" for atoms the user is currently working with.
          It allows specific configuration (Isotope selection) before spawning.
      */}
      <div className="flex-grow overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {palette.length === 0 && (
            <div className="text-center text-gray-600 text-sm mt-10 italic">
                Click "+ New Atom" to add elements to your palette.
            </div>
        )}
        
        {palette.map((item) => (
            <div 
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onClick={() => onSpawnAtom(item)}
                className="bg-gray-900 border border-gray-700 rounded-lg p-3 hover:border-gray-500 cursor-pointer active:scale-95 transition-all group relative hover:bg-gray-800"
            >
                <div className="flex items-center gap-3 mb-2">
                    {/* Visual Atom Representation */}
                    <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-inner"
                        style={{ backgroundColor: `${item.element.c}20`, color: item.element.c, border: `1px solid ${item.element.c}40` }}
                    >
                        {item.element.s}
                    </div>
                    <div>
                        <div className="font-bold text-sm text-white">{item.element.n}</div>
                        <div className="flex gap-2 text-xs text-gray-500">
                           <span>Mass: {item.element.iso[item.isotopeIndex].m.toFixed(1)}</span>
                           <span className="text-gray-400 border-l border-gray-700 pl-2">Valency: {item.element.v}</span>
                        </div>
                    </div>
                    {/* Remove Button: Added Drag/Mouse block to ensure strict separation from spawn logic */}
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            onRemoveFromPalette(item.id); 
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        className="absolute top-1 right-1 p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                        &times;
                    </button>
                </div>

                {/* 
                    Isotope Selector:
                    Critical for Nuclear Physics mode. Allows users to switch between
                    Stable isotopes and Radioactive ones (e.g. C-12 vs C-14).
                */}
                <select 
                    value={item.isotopeIndex}
                    onChange={(e) => onUpdateIsotope(item.id, Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300 focus:border-blue-500 outline-none"
                    onClick={(e) => e.stopPropagation()} // Prevent spawn when clicking select
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {item.element.iso.map((iso, idx) => (
                        <option key={idx} value={idx}>
                            {iso.name || `${item.element.s}-${Math.round(iso.m)}`} ({iso.hl === "stable" ? "Stable" : `${iso.hl}s`})
                        </option>
                    ))}
                </select>
            </div>
        ))}
      </div>

      {/* Footer Instructions */}
      <div className="p-3 border-t border-gray-800 bg-gray-900/50 text-[10px] text-gray-500 text-center">
          Left Click & Drag atoms to move.<br/>
          Right Click to delete.<br/>
          Drag from palette to add.
      </div>
    </div>
  );
};

export default Sidebar;
