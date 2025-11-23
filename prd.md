

# Product Requirements Document (PRD)
## Project: MolNuSim (SimChem)

### 1. Executive Summary
**SimChem** is a production-grade, browser-based physics simulator designed to visualize the bridge between Molecular Chemistry and Nuclear Physics. Unlike static molecular editors, SimChem provides a continuous, real-time environment where atoms are subject to rigorous physical forces, chemical bonding rules, and probabilistic nuclear decay. It serves as an educational sandbox allowing users to observe femtosecond-scale molecular vibrations alongside billion-year-scale radioactive decay chains.

### 2. Core User Experience Goals
1.  **Scientific Fidelity:** The simulation must adhere to VSEPR geometry, Valency rules, and IUPAC element data.
2.  **Hybrid Time-Scaling:** Users must be able to observe immediate chemical reactions (real-time) and long-term nuclear decay (accelerated time) within the same session.
3.  **Adaptive Interaction:** The interface must provide distinct, optimized control schemes for both Mouse/Keyboard (Desktop) and Touch (Mobile/Tablet) inputs.
4.  **Tactile Physics:** Interactions (dragging, throwing) must feel responsive and weighty. Momentum must be conserved when users release atoms.

---

### 3. Simulation Requirements (The Physics Engine)

The core simulation loop runs independently of the UI thread, utilizing a multi-layered physics integration approach (Euler integration with sub-stepping).

#### 3.1. Atomic Dynamics
*   **Soft-Body Physics:** Atoms are rendered as circular bodies with radii derived from atomic mass ($r \propto m^{0.33}$).
*   **Forces:**
    *   **Pauli Repulsion:** A strong, short-range repulsive force preventing atom overlap.
    *   **Bond Springs:** Hooke's Law constraints with damping to simulate covalent bonds.
    *   **Global Drag:** A tuned air-resistance factor applied per sub-step (~0.995) to prevent infinite energy accumulation while ensuring smooth gliding.
    *   **Wall Bouncing:** Atoms must collide elastically with the canvas boundaries.
*   **Momentum Conservation (Flinging):** 
    *   User interaction transfers velocity to the physics bodies upon release.
    *   **Velocity Overwrite:** To prevent internal spring tension or vibration from interfering with the throw, the velocity of the entire dragged molecule must be **overwritten** (not added to) with the mouse's release velocity.
    *   Input velocity must be normalized against physics sub-steps ($V_{physics} = V_{input} / Substeps$) to ensure accurate trajectory and speed.

#### 3.2. Molecular Geometry (VSEPR Implementation)
To prevent "floppy" molecules, the engine must enforce angular constraints based on Valence Shell Electron Pair Repulsion theory.
*   **Scope:** Applied to covalent non-metals (Groups 13-18 + H).
*   **Domain Calculation:** Geometry is determined by steric number (Bonds + Lone Pairs).
*   **Rigid Body Drag:** VSEPR constraints must remain **active** even while a molecule is being dragged. This ensures molecules like Water maintain their bent shape during movement, rather than trailing like a chain.
*   **Geometries Enforced:**
    *   **Linear:** 2 Domains (180°), e.g., $CO_2$.
    *   **Trigonal Planar:** 3 Domains (120°), e.g., $BF_3$.
    *   **Tetrahedral:** 4 Domains (109.5° projected to 2D), e.g., $CH_4$.
    *   **Bent:** 3 Domains (<120°) or 4 Domains (<109.5°), e.g., $H_2O$.
    *   **Expanded Octets:** Trigonal Bipyramidal (5) and Octahedral (6).
*   **Force Application (Physics Update):**
    *   **Torque Balancing:** Forces are calculated as $F = \tau / r$ to ensure torques cancel out perfectly. This prevents unequal bond lengths from inducing infinite spin (Angular Momentum Conservation).
    *   **Order Independence:** VSEPR forces are accumulated in a buffer and applied simultaneously at the end of the step. This eliminates "first-mover" drift bias where the calculation order affects the physical outcome.

#### 3.3. Chemistry Engine (Reactions & Annealing)
The engine acts as a "Heuristic Chemist," actively correcting user input and facilitating reactions.
*   **Bonding Rules:**
    *   Bonds form only if both atoms have available valence slots.
    *   **Bond Order:** Supports Single, Double, and Triple bonds based on electron sharing.
*   **Reaction Dynamics:**
    *   **Kinetic Insertion:** High-velocity atoms can impact an existing bond and insert themselves (e.g., $A + B-C \rightarrow A-B-C$).
    *   **Impact Dissociation:** High-energy collisions can sever bonds (Radical formation).
*   **Annealing (Error Correction):** The system must automatically "fix" energetically unfavorable configurations:
    *   **Homonuclear Severing:** If an atom is bonded to its own type (e.g., $O-O$) but detects a "Better Hub" (higher valency, e.g., $C$) nearby, it voluntarily breaks the bond to attach to the hub.
    *   **Acidic Correction:** Hydrogen atoms bonded to high-valency centers (like $P$ or $S$) will migrate to nearby Oxygen atoms to form Hydroxyl groups ($-OH$), mimicking acid structure.
*   **Drag Protection:** Chemical reactions (bond breaking/forming) and Annealing logic must be **disabled** for any group of atoms currently being dragged by the user.

#### 3.4. Nuclear Physics (Decay)
*   **Data Source:** Each atom tracks its specific isotope (Mass, Half-Life, Decay Mode).
*   **Probabilistic Model:** Decay occurs based on $P = 1 - 2^{-\Delta t / HL}$.
*   **Decay Modes:**
    *   **Alpha Decay:** Emission of simulated Alpha particles (visualized as gold sparks). Parent atom creates recoil; $Z \rightarrow Z-2$.
    *   **Beta Decay:** Emission of Beta particles (blue sparks). $Z \rightarrow Z+1$.
    *   **Transmutation:** The atom instance instantly changes element properties (Color, Radius, Valency) upon decay.
    *   **Chain Reactions:** Decay products must be valid atoms that can continue the decay chain (e.g., U-238 chain down to Pb-206).

---

### 4. Interface & Interaction Requirements

#### 4.1. The "Super Crunch" (Gravity Wells)
A specific physics mechanic used to facilitate complex molecule creation.
*   **Trigger:** Lasso selection or Recipe Spawn.
*   **Behavior:**
    1.  **Clear:** Existing atoms are pushed away from the spawn center.
    2.  **Gather:** Target atoms are pulled into a tight center point.
    3.  **Crunch:** High friction and high force are applied to force atoms into bonding distance immediately.

#### 4.2. Input Paradigms
*   **Desktop (Mouse):**
    *   **Drag & Drop:** Drag atoms from sidebar to canvas.
    *   **Pan:** Drag background to move view (if implemented) or use scrollbars.
    *   **Right-Click:** Delete atom (Context Menu).
*   **Mobile (Touch):**
    *   **Tap:** Spawn atom at random location.
    *   **Long Press:** Open Isotope Selector modal.
    *   **Ghost Drag:** Dragging vertically from the palette creates a "Ghost" element that spawns on the canvas upon release.
    *   **Lasso:** Drawing on empty space creates a selection polygon.

#### 4.3. UI Components
*   **Responsive Layout:**
    *   **Mobile/Overlay Mode (<1024px):** Active on phones and tablets (portrait & landscape). UI floats over the canvas to maximize viewable area. Menus are conditionally rendered (unmounted when closed) to prevent invisible interaction blocking.
    *   **Desktop/Panel Mode (>=1024px):** Active on large screens. Fixed side panel with standard mouse interactions.
*   **Sidebar Palette:**
    *   Dynamic list of active elements.
    *   Real-time isotope switching via dropdown.
    *   **Time Slider:**
        *   **0-50%:** Linear scale (Paused to 1x Real-time).
        *   **50-100%:** Logarithmic scale (1x to 10,000x) for visualizing half-lives.
*   **Periodic Table:**
    *   Full 118-element support.
    *   Correct IUPAC layout with separated Lanthanides/Actinides.
    *   Color-coded categories matching atom visuals.
*   **Recipe Picker:**
    *   Catalog of predefined compounds (Water, Acids, Solvents).
    *   Visual stoichiometry preview (dots representing ingredients).
    *   Clicking spawns ingredients and triggers the "Super Crunch".

---

### 5. Technical Specifications

*   **Framework:** React 19.
*   **Rendering:** HTML5 `<canvas>` Context 2D.
*   **State Management:**
    *   **React:** UI State (Modals, Palette list, Time slider).
    *   **Refs (Mutable):** Physics World (Atoms array, Particles array) to avoid Re-render thrashing.
*   **Performance:**
    *   Target 60 FPS on modern mobile devices.
    *   Physics Sub-stepping: 8 iterations per render frame for stability.
    *   **Drag Tuning:** Drag Coefficient fixed at 0.995 (effective ~0.96/frame) to balance glide vs. control.
    *   Spatial Partitioning (Optional/Future): Grid-based lookups for collision optimization if object count > 500.
*   **Visuals:**
    *   Pseudo-3D atom rendering using Radial Gradients and Specular Highlights.
    *   Bond rendering handles Single/Double/Triple lines dynamically.
    *   Particle systems for explosions and decay events.
