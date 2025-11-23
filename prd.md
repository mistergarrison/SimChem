# Product Requirements Document (PRD)
## Project: MolNuSim (SimChem)

### 1. Executive Summary
**SimChem** is a high-fidelity, browser-based educational tool designed to bridge the gap between standard molecular modeling (chemistry) and nuclear physics (decay chains). Unlike traditional visualizers that focus solely on static molecular geometry, SimChem simulates the dynamic lifespan of atoms, allowing users to observe radioactive decay, synthesize complex molecules via recipes, and interact with matter through rigorous physics simulations.

### 2. Core Objectives
1.  **Rigorous Simulation:** Adhere to scientific principles for bonding (Valency/VSEPR/Bond Order) and decay (Half-life probabilities).
2.  **Hybrid Time Scales:** Enable users to seamlessly transition between femtosecond-scale molecular vibrations and billion-year-scale nuclear half-lives via logarithmic time dilation.
3.  **Interactive Sandbox:** Provide a tactile environment including drag-and-drop spawning, a recipe system for synthesis, and manual tools for manipulating atomic clusters.

---

### 3. Functional Requirements

#### A. The Physics Engine
The custom physics engine (`Canvas.tsx`) handles multiple layers of interaction simultaneously, executed in a strict order to maximize stability and chemical accuracy.

**Layer 0: Reconfiguration (Annealing)**
*   **Goal:** Escape local minima (e.g., forming `O-O-C` instead of `O=C=O`) and ensure atoms find their optimal configuration.
*   **Mechanism:**
    *   *Homonuclear Bond Check:* The engine identifies bonds between identical elements (e.g., O-O, H-H).
    *   *Hub Detection:* If an atom involved in a homonuclear bond detects a nearby "Better Hub" (an atom with **strictly higher valency** and available slots, e.g., Carbon vs. Oxygen), the engine voluntarily severs the weaker homonuclear bond.
    *   *Result:* This frees the atom to bond with the superior hub in the subsequent physics step.

**Layer 1: Molecular Dynamics (Chemistry)**
*   **Bodies:** Atoms are treated as soft-body circles with radii derived from atomic mass (`r ~ mass^0.33`).
*   **Forces:**
    *   *Pauli Repulsion:* Strong short-range force to prevent atom overlap.
    *   *Bond Springs:* Hooke's Law forces with damping for bonded atoms.
    *   *VSEPR Geometry:* Angular stiffness forces enforcing correct bond angles.
        *   **Constraint:** Applied only to a specific set of covalent non-metals (`COVALENT_Z` set).
        *   **Geometries:** Supports Linear (2 domains), Trigonal Planar (3), Tetrahedral (4), and expanded octet projections (Pentagonal/Hexagonal).
*   **Advanced Bonding Logic:**
    *   **Valency Check:** Bonds form only if `current_bonds < valency`.
    *   **Bond Order:** Supports Single, Double, and Triple bonds.
        *   *Visuals:* Rendered as single, double, or triple lines based on bond count between two atoms.
    *   **Priority Heuristics:**
        *   *Hub Priority:* Atoms prioritize bonding to partners with higher valency.
        *   *Sigma Priority:* Atoms prioritize forming *new* connections over strengthening existing ones (Double bonding) if other candidates are nearby.
    *   **Reactions:**
        *   *Kinetic Insertion:* High-velocity impacts (Speed^2 > 20) allow atoms to insert themselves into existing bonds (A + B-C -> A-B-C).
        *   *Impact Dissociation:* High-energy collisions can break bonds (radical formation), allowing saturated molecules to react.

**Layer 2: Nuclear Physics (Decay)**
*   **Isotope Tracking:** Every atom instance tracks its specific isotope data (Mass, Half-life).
*   **Probabilistic Decay:**
    *   On every tick, calculate decay probability: `P = 1 - 2^(-dt / HalfLife)`.
    *   *Time Scale Factor:* The simulation handles time acceleration (Logarithmic scale) to make long half-lives visible.
*   **Transmutation Events:**
    *   **Alpha Decay:** Emission of Helium nucleus. Parent atom loses mass/protons. Visual: Yellow flash + Recoil Kick.
    *   **Beta Decay:** Neutron -> Proton. Atomic number increases. Visual: Blue flash + Recoil Kick.

**Layer 3: Reaction Gravity Wells (The "Super Crunch")**
*   **Mechanism:** A physics-driven event used by Recipes and the Lasso tool.
*   **Obstruction Clearing (Recipes only):** Before spawning ingredients, the engine calculates the center of mass of existing molecules near the spawn point and applies a strong outward velocity to push them away, ensuring a clean workspace.
*   **Phases:**
    1.  *Gathering (0-50%):* Gently pulls ingredients to a center point.
    2.  *Compression (50-85%):* Increases force to overcome repulsion.
    3.  *Super Crunch (85-100%):* A high-force, high-friction "Vise" state that forces atoms into a dense cluster, ensuring all neighbors are within bonding range for complex structures like SF6.

#### B. User Interface (UI)

**1. Sidebar & Palette**
*   **Active Palette:** Users curate a specific list of atoms to work with.
*   **Isotope Selector:** Dropdown allows switching between stable and radioactive variants (e.g., U-235 vs U-238).
*   **Time Control:** Hybrid Linear/Logarithmic slider.
    *   *0-50:* Linear scale (0x to 1x).
    *   *50-100:* Logarithmic scale (1x to 10,000x) for observing long half-lives.
*   **Drag-and-Drop:** Atoms are serialized to JSON on drag start and hydrated on drop.

**2. The Periodic Table Picker**
*   **Completeness:** Renders all 118 elements (H to Og).
*   **Layout:** Standard 18-column grid with F-Block (Lanthanides/Actinides) separated below.
*   **Grid Logic:** Dynamically calculates row/column positions to handle gaps in Periods 1, 2, and 3 correctly.
*   **Selection:** Adds chosen element to the Sidebar palette.

**3. Recipe Picker**
*   **Catalog:** A library of predefined chemical compounds (Water, Acids, Hydrocarbons, etc.).
*   **Visuals:** Displays ingredients as colored dots representing the stoichiometry.
*   **Function:** Triggers the Obstruction Clearing -> Spawn -> Gravity Well sequence.

**4. Canvas Interaction**
*   **Lasso Tool:**
    *   *Input:* User draws a freeform shape.
    *   *Detection:* Uses Ray Casting algorithm (`isPointInPolygon`) to identify enclosed atoms.
    *   *Action:* Triggers a manual Gravity Well on the selected group to force reaction.
*   **Manipulation:** Mouse interaction allows throwing atoms (momentum transfer) or dragging molecules.
*   **Visuals:**
    *   Pseudo-3D shading (Radial gradients + Specular highlights).
    *   Selection Halos: Primary halo for hovered atom, secondary halo for the entire bonded molecule group.

---

### 4. Technical Constraints & Architecture
*   **Stack:** React 19, TypeScript, HTML5 Canvas API.
*   **Performance:** Optimized for 60 FPS with mutable state refs (`useRef`) avoiding React render cycles for the physics loop.
*   **Substepping:** Physics integration runs 8 substeps per frame to ensure stability of stiff VSEPR constraints.
*   **Data Source:** Static, immutable definitions in `constants.ts` for Elements (Z=1-118), Isotopes, and Recipes.
