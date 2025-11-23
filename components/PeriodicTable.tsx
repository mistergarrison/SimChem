
import React from 'react';
import { ElementData } from '../types';
import { ELEMENTS } from '../constants';

interface PeriodicTableProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (element: ElementData) => void;
}

/**
 * PeriodicTable Component
 * 
 * Role: The comprehensive catalog of all 118 chemical elements.
 * 
 * Architectural Goals & Requirements:
 * 1. **Scientific Completeness**: This is not a toy table. It MUST render a tile for every element 
 *    from Hydrogen (1) to Oganesson (118). No truncation allowed.
 * 
 * 2. **Standard IUPAC Layout (18-Column Grid)**:
 *    - The table must adhere to the standard 18-column layout used in physics/chemistry.
 *    - **S-Block**: Groups 1 & 2.
 *    - **P-Block**: Groups 13-18.
 *    - **D-Block**: Groups 3-12 (Transition metals).
 *    - **F-Block**: Lanthanides and Actinides must be visually separated and placed *below* the main body 
 *      to prevent the table from becoming unwieldy (32 columns wide).
 * 
 * 3. **Navigation & Spawn Interaction**:
 *    - Clicking any element sets it as the active selection for the Sidebar palette.
 *    - It serves as the primary way to access elements not in the default quick-palette.
 */
const PeriodicTable: React.FC<PeriodicTableProps> = ({ isOpen, onClose, onSelect }) => {
  if (!isOpen) return null;

  /**
   * Grid Position Logic
   * 
   * Calculates the specific (Column, Row) for a given Atomic Number (Z).
   * This logic maps the linear list of elements (Z=1 to Z=118) onto the 2D periodic structure.
   */
  const getGridPos = (z: number) => {
    // --- Period 1 (H, He) ---
    // Special case: H is Group 1, He is Group 18 (Noble Gas)
    if (z === 1) return { col: 1, row: 1 };
    if (z === 2) return { col: 18, row: 1 };

    // --- Periods 2 & 3 (Li-Ne, Na-Ar) ---
    // These periods lack the d-block (transition metals).
    // Elements jump from Group 2 (s-block) directly to Group 13 (p-block).
    // Logic: If Z > 4 (or 12), shift column by +10 to skip the d-block gap.
    if (z >= 3 && z <= 4) return { col: z - 2, row: 2 };   
    if (z >= 5 && z <= 10) return { col: z + 8, row: 2 };  

    if (z >= 11 && z <= 12) return { col: z - 10, row: 3 }; 
    if (z >= 13 && z <= 18) return { col: z, row: 3 };      

    // --- Periods 4 & 5 (K-Kr, Rb-Xe) ---
    // Standard periods with s, d, and p blocks. No gaps.
    // 18 Columns wide.
    if (z >= 19 && z <= 36) return { col: z - 18, row: 4 }; 
    if (z >= 37 && z <= 54) return { col: z - 36, row: 5 }; 

    // --- Period 6 (Cs-Rn) ---
    // Introduction of the F-Block (Lanthanides).
    // Cs(55), Ba(56) -> s-block.
    // 57-71 (Lanthanides) -> REMOVED from main grid, placed below.
    // Hf(72) -> Resumes d-block at Group 4.
    if (z === 55) return { col: 1, row: 6 }; 
    if (z === 56) return { col: 2, row: 6 }; 
    if (z >= 72 && z <= 86) return { col: z - 68, row: 6 }; // Offset to align Hf under Zr

    // --- Period 7 (Fr-Og) ---
    // Introduction of the F-Block (Actinides).
    // Fr(87), Ra(88) -> s-block.
    // 89-103 (Actinides) -> REMOVED from main grid, placed below.
    // Rf(104) -> Resumes d-block at Group 4.
    if (z === 87) return { col: 1, row: 7 }; 
    if (z === 88) return { col: 2, row: 7 }; 
    if (z >= 104 && z <= 118) return { col: z - 100, row: 7 }; 

    // --- F-BLOCK (Lanthanides & Actinides) ---
    // These rows are visually detached to maintain the table's aspect ratio.
    // We map them to rows 9 and 10.
    
    // Lanthanides (57-71)
    if (z >= 57 && z <= 71) return { col: z - 53, row: 9 }; 

    // Actinides (89-103)
    if (z >= 89 && z <= 103) return { col: z - 85, row: 10 }; 

    // Safety fallback
    return { col: 1, row: 1 };
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Select Element</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            &times;
          </button>
        </div>

        {/* 
            Grid Container 
            We use CSS Grid with explicit 18 columns to strictly enforce the periodic structure.
        */}
        <div 
            className="grid gap-1 mx-auto"
            style={{ 
                gridTemplateColumns: 'repeat(18, minmax(0, 1fr))',
                gridTemplateRows: 'repeat(10, minmax(0, 1fr))'
            }}
        >
          {ELEMENTS.map((el) => {
            const pos = getGridPos(el.z);
            return (
              <button
                key={el.z}
                onClick={() => { onSelect(el); onClose(); }}
                className="relative p-1 border border-gray-700 hover:border-white hover:z-10 transition-all duration-150 flex flex-col items-center justify-center h-16 sm:h-20 bg-gray-800 text-white group"
                style={{
                    gridColumnStart: pos.col,
                    gridRowStart: pos.row,
                    backgroundColor: 'rgba(31, 41, 55, 0.5)'
                }}
              >
                {/* Visual Flair: Element Category Color Overlay */}
                <div 
                    className="absolute inset-0 opacity-20 group-hover:opacity-40 transition-opacity"
                    style={{ backgroundColor: el.c }}
                />
                
                {/* Data Display */}
                <span className="text-xs sm:text-sm font-bold relative z-10">{el.z}</span>
                <span className="text-sm sm:text-xl font-extrabold relative z-10" style={{color: el.c}}>{el.s}</span>
                <span className="text-[8px] sm:text-[10px] truncate max-w-full relative z-10 opacity-70">{el.n}</span>
                
                {/* Valency Indicator */}
                <span className="absolute bottom-1 right-1 text-[8px] text-gray-400 opacity-50 z-10">V:{el.v}</span>
              </button>
            );
          })}
          
          {/* 
              Placeholder Indicators
              These visual cues show where the F-Block (Lanthanides/Actinides) 
              would theoretically fit into the main table (between Groups 2 and 3).
          */}
          <div className="col-start-3 row-start-6 border border-dashed border-gray-600 flex items-center justify-center text-gray-500 text-xs text-center p-1">
            57-71<br/>La-Lu
          </div>
          <div className="col-start-3 row-start-7 border border-dashed border-gray-600 flex items-center justify-center text-gray-500 text-xs text-center p-1">
            89-103<br/>Ac-Lr
          </div>
        </div>
      </div>
    </div>
  );
};

export default PeriodicTable;
