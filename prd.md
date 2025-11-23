# Product Requirements Document (PRD)
## Project: MolNuSim (Molecular & Nuclear Physics Simulator)

### 1. Executive Summary
**MolNuSim** is a high-fidelity, browser-based educational tool designed to bridge the gap between standard molecular modeling (chemistry) and nuclear physics (decay chains). Unlike traditional visualizers that focus solely on static molecular geometry, MolNuSim simulates the dynamic lifespan of atoms, allowing users to observe radioactive decay and transmutation in real-time alongside chemical bonding.

### 2. Core Objectives
1.  **Rigorous Simulation:** Adhere to scientific principles for both bonding (Valency/VSEPR) and decay (Half-life probabilities).
2.  **Hybrid Time Scales:** Enable users to seamlessly transition between femtosecond-scale molecular vibrations and billion-year-scale nuclear half-lives via logarithmic time dilation.
3.  **Interactive Sandbox:** Provide a tactile, drag-and-drop environment for constructing molecules and observing spontaneous nuclear events.

---

### 3. Functional Requirements

#### A. The Physics Engine
The custom physics engine must handle two distinct layers of interaction simultaneously:

**Layer 1: Molecular Dynamics (Chemistry)**
*   **Bodies:** Atoms are treated as soft-body circles with radii derived from atomic mass (`r ~ mass^0.33`).
*   **Forces:**
    *   *Pauli Repulsion:* Strong short-range force to prevent atom overlap.
    *   *Van der Waals:* Weak attraction forces at medium range to simulate states of matter.
    *   *Drag:* Atmospheric friction to stabilize the system.
*   **Bonding Logic:**
    *   Bonds form upon collision if `current_bonds < valency`.
    *   **VSEPR Geometry:** Bonds are not merely springs. The engine must enforce specific bond angles (Linear, Trigonal Planar, Tetrahedral, etc.) based on the atom's Steric Number (Bonds + Lone Pairs) to prevent "floppy" molecules.
    *   *Visual Filter:* Bond lines are drawn primarily for Covalent interactions (Non-metals).

**Layer 2: Nuclear Physics (Decay)**
*   **Isotope Tracking:** Every atom instance tracks its specific isotope data (Mass, Half-life).
*   **Probabilistic Decay:**
    *   On every tick, calculate decay probability: `P = 1 - 2^(-dt / HalfLife)`.
    *   *Time Scale Factor:* The simulation must handle time acceleration up to 10,000x to make long half-lives visible.
*   **Transmutation Events:**
    *   **Alpha Decay:** Emission of Helium nucleus. Parent atom loses mass/protons. Visual: Yellow flash + Recoil.
    *   **Beta Decay:** Neutron -> Proton. Atomic number increases. Visual: Blue flash.
    *   **Chain Reactions:** Product atoms must inherit correct velocity and immediately enter the simulation, potentially decaying further (e.g., U-238 -> Th-234 -> ... -> Pb-206).

#### B. User Interface (UI)

**1. Sidebar & Palette**
*   **Active Palette:** Users curate a specific list of atoms to work with.
*   **Isotope Selector:** A critical control allowing specific selection of isotopes (e.g., switching "Carbon" from stable C-12 to radioactive C-14).
*   **Time Control:** A hybrid Linear/Logarithmic slider.
    *   0-50%: Linear (0x to 1x speed).
    *   50-100%: Logarithmic (1x to 10,000x speed).

**2. The Periodic Table Picker**
*   **Completeness:** Must render all 118 elements (H to Og).
*   **Layout:** Standard 18-column grid.
*   **F-Block Separation:** Lanthanides (57-71) and Actinides (89-103) must be visually detached and placed below the main body to preserve the standard aspect ratio.

**3. Canvas Interaction**
*   **Drag-and-Drop:** Atoms can be dragged from the sidebar or moved within the canvas.
*   **Context Menu:** Right-click to delete or inspect.
*   **Visual Feedback:** Dynamic cursors (Grab/Grabbing), bond stress visualization, and particle effects for nuclear events.

---

### 4. Technical Constraints & Architecture
*   **Stack:** React 19, TypeScript, HTML5 Canvas API.
*   **Performance:** Must maintain 60 FPS with 100+ interacting bodies.
*   **State Management:** Physics state must be mutable (`useRef`) to bypass React render cycles for the high-frequency simulation loop (Integration steps).
*   **Data Source:** The application must use a static, immutable source of truth (`ELEMENTS` constant) containing the specific decay chain data.

### 5. Future Roadmap (Out of Scope for v1)
*   Ionic lattice structures.
*   Temperature/Heat controls.
*   Save/Load simulation states.