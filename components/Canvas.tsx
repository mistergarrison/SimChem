
import React, { useRef, useEffect, useCallback } from 'react';
import { Atom, Particle, Recipe } from '../types';
import { ELEMENTS } from '../constants';
import { MouseState } from '../simulation/types';
import { SUBSTEPS, MAX_SPEED, DRAG_COEFF } from '../simulation/constants';
import { isPointInPolygon, getMoleculeGroup } from '../simulation/utils';
import { applyVSEPR } from '../simulation/vsepr';
import { annealAtoms, resolveInteractions, processDecay, createExplosion } from '../simulation/chemistry';
import { renderCanvas } from '../simulation/renderer';

interface CanvasProps {
  timeScale: number;
  isPlaying: boolean;
  onAtomCountChange: (count: number) => void;
  clearTrigger: number;
  spawnRequest: { z: number; isoIndex: number; id: number; x?: number; y?: number } | null;
  recipeRequest: { recipe: Recipe; id: number } | null;
}

/**
 * Canvas Component
 * 
 * The critical bridge between React's Declarative UI and the Imperative Physics Simulation.
 * 
 * Architectural Pattern: "The Game Loop Shell"
 * 
 * 1. **React's Role**: 
 *    - Handles high-level state (e.g., Time Scale slider, incoming Spawn Requests).
 *    - Renders the <canvas> DOM element.
 *    - Sets up Event Listeners (Pointer, Drag/Drop).
 * 
 * 2. **Mutable State via Refs**:
 *    - `atomsRef` and `particlesRef` store the heavy simulation data. 
 *    - We DO NOT use React State (`useState`) for atom positions because triggering 
 *      a React Re-render 60 times a second for 100+ objects would destroy performance.
 * 
 * 3. **The Loop (`update`)**:
 *    - A `requestAnimationFrame` loop runs independently of React.
 *    - It executes the Physics Logic (imported from `simulation/`) and then the Renderer.
 */
const Canvas: React.FC<CanvasProps> = ({
  timeScale,
  isPlaying,
  clearTrigger,
  spawnRequest,
  recipeRequest
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Mutable state for physics bodies (High performance, No re-renders)
  const atomsRef = useRef<Atom[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  
  // Interaction state (Mouse/Touch tracking)
  const mouseRef = useRef<MouseState>({ 
      x: 0, y: 0, 
      lastX: 0, lastY: 0,
      vx: 0, vy: 0, 
      isDown: false, 
      dragId: null,
      hoverId: null,
      dragGroup: new Set<string>(),
      isLassoing: false,
      lassoPoints: [],
      recipeHaloLife: 0,
      recipeHaloMaxLife: 0,
      recipeTarget: null
  });
  const rafRef = useRef<number>(0);

  // --- LIFECYCLE HANDLERS ---

  useEffect(() => {
    if (clearTrigger > 0) {
      atomsRef.current = [];
      particlesRef.current = [];
      mouseRef.current.recipeTarget = null;
      mouseRef.current.recipeHaloLife = 0;
    }
  }, [clearTrigger]);

  // Handle Single Spawn (Triggered by Sidebar tap/drop)
  useEffect(() => {
    if (spawnRequest && canvasRef.current) {
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;
        
        let spawnX, spawnY;
        if (spawnRequest.x !== undefined && spawnRequest.y !== undefined) {
             const rect = canvasRef.current.getBoundingClientRect();
             const scaleX = canvasRef.current.width / rect.width;
             const scaleY = canvasRef.current.height / rect.height;
             
             spawnX = (spawnRequest.x - rect.left) * scaleX;
             spawnY = (spawnRequest.y - rect.top) * scaleY;
        } else {
             spawnX = width / 2 + (Math.random() - 0.5) * 100;
             spawnY = height / 2 + (Math.random() - 0.5) * 100;
        }

        spawnAtom(spawnX, spawnY, spawnRequest.z, spawnRequest.isoIndex);
    }
  }, [spawnRequest]);

  // Handle Recipe Spawn (Triggered by Recipe Picker)
  useEffect(() => {
      if (recipeRequest && canvasRef.current) {
          const width = canvasRef.current.width;
          const height = canvasRef.current.height;
          const cx = width / 2;
          const cy = height / 2;
          const clearRadius = 250;
          const spawnRadius = 80;

          // 1. Clear Area: Push existing atoms away to make room
          const allAtoms = atomsRef.current;
          const visited = new Set<string>();

          for (let i = 0; i < allAtoms.length; i++) {
              const atom = allAtoms[i];
              if (visited.has(atom.id)) continue;

              const groupIds = getMoleculeGroup(allAtoms, atom.id);
              const groupAtoms: Atom[] = [];
              let isObstructing = false;
              
              groupIds.forEach(id => {
                  visited.add(id);
                  const a = allAtoms.find(at => at.id === id);
                  if (a) {
                      groupAtoms.push(a);
                      const d = Math.sqrt((a.x - cx)**2 + (a.y - cy)**2);
                      if (d < clearRadius) isObstructing = true;
                  }
              });

              if (isObstructing) {
                   let mx = 0, my = 0;
                   groupAtoms.forEach(a => { mx += a.x; my += a.y; });
                   mx /= groupAtoms.length;
                   my /= groupAtoms.length;

                   let dx = mx - cx;
                   let dy = my - cy;
                   let dist = Math.sqrt(dx*dx + dy*dy);
                   if (dist < 0.1) { dx = 1; dy = 0; dist = 1; }

                   const nx = dx / dist;
                   const ny = dy / dist;
                   const targetDist = clearRadius + 50;
                   const pushAmt = Math.max(0, targetDist - dist);

                   groupAtoms.forEach(a => {
                       a.x += nx * pushAmt;
                       a.y += ny * pushAmt;
                       a.vx = nx * 8; 
                       a.vy = ny * 8;
                   });
              }
          }

          // 2. Spawn Ingredients
          const newAtoms: Atom[] = [];
          recipeRequest.recipe.ingredients.forEach(ing => {
              for (let i = 0; i < ing.count; i++) {
                  const angle = Math.random() * Math.PI * 2;
                  const r = Math.random() * spawnRadius;
                  const x = cx + Math.cos(angle) * r;
                  const y = cy + Math.sin(angle) * r;
                  const atom = spawnAtom(x, y, ing.z, 0); 
                  if (atom) newAtoms.push(atom);
              }
          });

          // 3. Setup Recipe "Gravity Well" (The Super Crunch)
          const duration = 30; 
          mouseRef.current.recipeTarget = {
             ids: newAtoms.map(a => a.id),
             cx,
             cy,
             startRadius: 130 
          };
          mouseRef.current.recipeHaloLife = duration;
          mouseRef.current.recipeHaloMaxLife = duration;
      }
  }, [recipeRequest]);


  const spawnAtom = useCallback((x: number, y: number, z: number, isoIdx: number) => {
    const elem = ELEMENTS.find(e => e.z === z);
    if (!elem) return null;

    const iso = elem.iso[isoIdx];
    const mass = iso.m;
    const radius = 10 + Math.pow(mass, 0.33) * 3;
    
    const newAtom: Atom = {
      id: Math.random().toString(36).substr(2, 9),
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      element: elem,
      isotopeIndex: isoIdx,
      bonds: [],
      mass,
      radius,
      lastDecayCheck: Date.now()
    };
    
    atomsRef.current.push(newAtom);
    return newAtom;
  }, []);

  const triggerLassoImplosion = (targets: Atom[], cx: number, cy: number) => {
     if (targets.length < 2) return;
     let maxR = 0;
     targets.forEach(a => {
         const d = Math.sqrt((a.x - cx)**2 + (a.y - cy)**2);
         if (d > maxR) maxR = d;
     });
     const duration = 30; 
     mouseRef.current.recipeTarget = {
         ids: targets.map(a => a.id),
         cx,
         cy,
         startRadius: Math.max(100, maxR + 50) 
     };
     mouseRef.current.recipeHaloLife = duration;
     mouseRef.current.recipeHaloMaxLife = duration;
  };

  // --- MAIN PHYSICS LOOP ---
  const update = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Mouse Momentum Calculation (for "Throwing" atoms)
    const mouseDx = mouseRef.current.x - mouseRef.current.lastX;
    const mouseDy = mouseRef.current.y - mouseRef.current.lastY;
    mouseRef.current.lastX = mouseRef.current.x;
    mouseRef.current.lastY = mouseRef.current.y;
    
    const alpha = 0.5; // Tuned for snappier throw release
    mouseRef.current.vx = mouseRef.current.vx * (1 - alpha) + mouseDx * alpha;
    mouseRef.current.vy = mouseRef.current.vy * (1 - alpha) + mouseDy * alpha;

    // Cursor Styling
    if (mouseRef.current.isLassoing) canvas.style.cursor = 'crosshair';
    else if (mouseRef.current.isDown) canvas.style.cursor = 'grabbing';
    else if (mouseRef.current.hoverId) canvas.style.cursor = 'grab';
    else canvas.style.cursor = 'default';

    if (isPlaying) {
      // 1. UPDATE PARTICLES
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) particlesRef.current.splice(i, 1);
      }

      // 2. RADIOACTIVE DECAY
      processDecay(atomsRef.current, particlesRef.current, 0.016 * timeScale);

      // --- DYNAMIC DRAG GROUP REFRESH ---
      if (mouseRef.current.isDown && mouseRef.current.dragId) {
          const exists = atomsRef.current.some(a => a.id === mouseRef.current.dragId);
          if (!exists) {
              mouseRef.current.dragId = null;
              mouseRef.current.isDown = false;
              mouseRef.current.dragGroup.clear();
          } else {
              mouseRef.current.dragGroup = getMoleculeGroup(atomsRef.current, mouseRef.current.dragId);
          }
      }

      // 3. PHYSICS SUBSTEPS (Running physics 8x per frame for stability)
      for (let step = 0; step < SUBSTEPS; step++) {
          
          // A. Annealing
          annealAtoms(atomsRef.current, mouseRef.current.dragGroup);

          // B. RIGID GROUP DRAG
          // Prevents molecule stretching and spin by applying the drag force 
          // to ALL atoms in the molecule equally.
          if (mouseRef.current.isDown && mouseRef.current.dragId) {
              const draggedAtom = atomsRef.current.find(atom => atom.id === mouseRef.current.dragId);
              if (draggedAtom) {
                  // Calculate the vector from the Handle to the Mouse cursor
                  const dx = mouseRef.current.x - draggedAtom.x;
                  const dy = mouseRef.current.y - draggedAtom.y;
                  const k = 0.2; // Drag stiffness

                  // Apply this vector force to EVERY atom in the drag group.
                  // This simulates grabbing the whole rigid body, not just one point.
                  mouseRef.current.dragGroup.forEach(id => {
                      const a = atomsRef.current.find(at => at.id === id);
                      if (a) {
                          a.vx += dx * k;
                          a.vy += dy * k;
                          
                          // Stable Damping for the dragged group
                          // Helps them stop exactly at the mouse pointer without overshoot
                          a.vx *= 0.90; 
                          a.vy *= 0.90;
                      }
                  });
              }
          }

          // C. Recipe Gravity Well
          if (mouseRef.current.recipeTarget && mouseRef.current.recipeHaloLife > 0) {
              const { ids, cx, cy } = mouseRef.current.recipeTarget;
              const currentLife = mouseRef.current.recipeHaloLife;
              const maxLife = mouseRef.current.recipeHaloMaxLife;
              const progress = 1 - (currentLife / maxLife);

              let strength = 0.05;
              let damping = 0.90;

              if (progress > 0.5) {
                  strength = 0.15;
                  damping = 0.80;
              }
              if (progress > 0.85) {
                  strength = 0.8; 
                  damping = 0.3; 
              }

              ids.forEach(id => {
                 const a = atomsRef.current.find(at => at.id === id);
                 if (a) {
                     const dx = cx - a.x;
                     const dy = cy - a.y;
                     a.vx += dx * strength;
                     a.vy += dy * strength;
                     a.vx *= damping;
                     a.vy *= damping;
                 }
              });
              
              mouseRef.current.recipeHaloLife -= (1 / SUBSTEPS); 
          }
          
          // D. VSEPR
          applyVSEPR(atomsRef.current, mouseRef.current.dragGroup);

          // E. INTERACTIONS
          resolveInteractions(atomsRef.current, particlesRef.current, mouseRef.current.dragId, mouseRef.current.dragGroup);

          // F. INTEGRATION
          const atomCount = atomsRef.current.length;
          for (let i = 0; i < atomCount; i++) {
              const a = atomsRef.current[i];
              a.vx *= DRAG_COEFF;
              a.vy *= DRAG_COEFF;

              const speedSq = a.vx*a.vx + a.vy*a.vy;
              if (speedSq > MAX_SPEED*MAX_SPEED) {
                  const scale = MAX_SPEED / Math.sqrt(speedSq);
                  a.vx *= scale;
                  a.vy *= scale;
              }

              a.x += a.vx;
              a.y += a.vy;

              // Wall Bouncing
              const restitution = 0.5;
              if (a.x < a.radius) { a.x = a.radius; a.vx = Math.abs(a.vx) * restitution; }
              else if (a.x > width - a.radius) { a.x = width - a.radius; a.vx = -Math.abs(a.vx) * restitution; }
              if (a.y < a.radius) { a.y = a.radius; a.vy = Math.abs(a.vy) * restitution; }
              else if (a.y > height - a.radius) { a.y = height - a.radius; a.vy = -Math.abs(a.vy) * restitution; }
          }
      }
      
      if (mouseRef.current.recipeHaloLife <= 0) mouseRef.current.recipeTarget = null;
    }

    renderCanvas(ctx, atomsRef.current, particlesRef.current, mouseRef.current, width, height);
    rafRef.current = requestAnimationFrame(update);
  }, [isPlaying, timeScale]);

  // --- EVENTS & SETUP ---

  useEffect(() => {
    rafRef.current = requestAnimationFrame(update);
    return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  }, [update]);

  const getPointerPos = (e: React.PointerEvent | React.MouseEvent | React.DragEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
  }

  const handlePointerDown = (e: React.PointerEvent) => {
      e.preventDefault();
      const { x, y } = getPointerPos(e);

      let clickedId = null;
      for (let i = atomsRef.current.length - 1; i >= 0; i--) {
          const a = atomsRef.current[i];
          const dx = a.x - x;
          const dy = a.y - y;
          if (dx*dx + dy*dy < (a.radius * 1.5) ** 2) { 
              clickedId = a.id;
              break;
          }
      }

      if (clickedId) {
          mouseRef.current.isDown = true;
          mouseRef.current.dragId = clickedId;
          mouseRef.current.x = x;
          mouseRef.current.y = y;
          mouseRef.current.lastX = x;
          mouseRef.current.lastY = y;
          mouseRef.current.vx = 0;
          mouseRef.current.vy = 0;
          mouseRef.current.dragGroup = getMoleculeGroup(atomsRef.current, clickedId);
          (e.target as Element).setPointerCapture(e.pointerId);
      } else {
          mouseRef.current.isLassoing = true;
          mouseRef.current.lassoPoints = [{x, y}];
          (e.target as Element).setPointerCapture(e.pointerId);
      }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      e.preventDefault();
      const { x, y } = getPointerPos(e);
      mouseRef.current.x = x;
      mouseRef.current.y = y;

      if (mouseRef.current.isLassoing) {
          mouseRef.current.lassoPoints.push({x, y});
      } else if (!mouseRef.current.isDown) {
          let hoverId = null;
          for (let i = atomsRef.current.length - 1; i >= 0; i--) {
              const a = atomsRef.current[i];
              const dx = a.x - x;
              const dy = a.y - y;
              if (dx*dx + dy*dy < (a.radius * 1.5) ** 2) {
                  hoverId = a.id;
                  break;
              }
          }
          mouseRef.current.hoverId = hoverId;
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      e.preventDefault();
      
      if (mouseRef.current.isLassoing) {
          const points = mouseRef.current.lassoPoints;
          if (points.length > 2) {
            const selected = atomsRef.current.filter(a => isPointInPolygon(a, points));
            if (selected.length > 1) {
                let sumX = 0, sumY = 0;
                selected.forEach(a => { sumX += a.x; sumY += a.y; });
                const cx = sumX / selected.length;
                const cy = sumY / selected.length;
                triggerLassoImplosion(selected, cx, cy);
            }
          }
          mouseRef.current.isLassoing = false;
          mouseRef.current.lassoPoints = [];
      }

      // FLING LOGIC
      // Overwrites velocity for the entire group with the mouse's throw vector.
      // This kills any internal "spin" velocity accumulated during drag.
      if (mouseRef.current.isDown && mouseRef.current.dragGroup.size > 0) {
          const flingMultiplier = 1.0 / SUBSTEPS; 
          const mvx = mouseRef.current.vx * flingMultiplier;
          const mvy = mouseRef.current.vy * flingMultiplier;
          
          mouseRef.current.dragGroup.forEach(id => {
              const atom = atomsRef.current.find(a => a.id === id);
              if (atom) {
                  atom.vx = mvx;
                  atom.vy = mvy;
              }
          });
      }

      mouseRef.current.isDown = false;
      mouseRef.current.dragId = null;
      mouseRef.current.dragGroup.clear();
      (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const { x, y } = getPointerPos(e);
      const clickedIndex = atomsRef.current.findIndex(a => {
        const dx = a.x - x;
        const dy = a.y - y;
        return (dx*dx + dy*dy) < (a.radius ** 2);
      });

      if (clickedIndex !== -1) {
          const atom = atomsRef.current[clickedIndex];
          createExplosion(particlesRef.current, atom.x, atom.y, '#ffffff', 10);
          atomsRef.current.splice(clickedIndex, 1);
          atomsRef.current.forEach(a => {
              a.bonds = a.bonds.filter(id => id !== atom.id);
          });
      }
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const { x, y } = getPointerPos(e);
      try {
        const dataStr = e.dataTransfer.getData('application/json');
        if (dataStr) {
            const data = JSON.parse(dataStr);
            spawnAtom(x, y, data.z, data.isoIndex);
        }
      } catch (err) {
          console.error("Drop error", err);
      }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      
      const updateSize = () => {
          if (canvas.parentElement) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
          }
      };
      updateSize();
      const resizeObserver = new ResizeObserver(() => {
          window.requestAnimationFrame(updateSize);
      });
      resizeObserver.observe(canvas.parentElement);
      return () => resizeObserver.disconnect();
  }, []);

  return (
    <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={handleContextMenu}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="w-full h-full touch-none block select-none"
    />
  );
};

export default Canvas;
