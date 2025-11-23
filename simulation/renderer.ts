
import { Atom, Particle } from '../types';
import { MouseState } from './types';
import { COVALENT_Z } from './constants'; 
import { getBondOrder as calculateBondOrder } from './utils'; // Helper

export const renderCanvas = (
    ctx: CanvasRenderingContext2D,
    atoms: Atom[],
    particles: Particle[],
    mouse: MouseState,
    width: number,
    height: number
) => {
    ctx.fillStyle = '#0b0f19'; 
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = "round";
    
    // Draw Lasso
    if (mouse.isLassoing && mouse.lassoPoints.length > 0) {
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        const points = mouse.lassoPoints;
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw Recipe Bonding Halo
    if (mouse.recipeHaloLife > 0) {
        const life = mouse.recipeHaloLife;
        const max = mouse.recipeHaloMaxLife;
        const ratio = life / max;
        
        const cx = mouse.recipeTarget?.cx || 0;
        const cy = mouse.recipeTarget?.cy || 0;
        
        const startRadius = mouse.recipeTarget?.startRadius || 200;
        const endRadius = 50;
        const radius = endRadius + (startRadius - endRadius) * ratio;

        ctx.strokeStyle = `rgba(0, 255, 255, ${Math.min(1, ratio + 0.2)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw Bonds
    atoms.forEach(a => {
        const uniquePartners = [...new Set(a.bonds)];
        uniquePartners.forEach(bid => {
            const b = atoms.find(atom => atom.id === bid);
            if (b && a.id < b.id) { 
                const isCovalent = COVALENT_Z.has(a.element.z) && COVALENT_Z.has(b.element.z);
                const order = calculateBondOrder(a, bid);

                ctx.strokeStyle = isCovalent ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
                ctx.lineWidth = Math.min(a.radius, b.radius) * 0.4;
                
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                const nx = -dy / dist;
                const ny = dx / dist;
                const offset = 3; 

                if (order === 1) {
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                } else if (order === 2) {
                    ctx.lineWidth *= 0.6;
                    ctx.beginPath();
                    ctx.moveTo(a.x + nx * offset, a.y + ny * offset);
                    ctx.lineTo(b.x + nx * offset, b.y + ny * offset);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(a.x - nx * offset, a.y - ny * offset);
                    ctx.lineTo(b.x - nx * offset, b.y - ny * offset);
                    ctx.stroke();
                } else if (order >= 3) {
                    ctx.lineWidth *= 0.5;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(a.x + nx * offset * 1.5, a.y + ny * offset * 1.5);
                    ctx.lineTo(b.x + nx * offset * 1.5, b.y + ny * offset * 1.5);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(a.x - nx * offset * 1.5, a.y - ny * offset * 1.5);
                    ctx.lineTo(b.x - nx * offset * 1.5, b.y - ny * offset * 1.5);
                    ctx.stroke();
                }
            }
        });
    });

    // Draw Atoms
    atoms.forEach(a => {
        const isDraggedGroup = mouse.dragGroup.has(a.id);
        const isHovered = mouse.hoverId === a.id;
        
        const grad = ctx.createRadialGradient(a.x, a.y, a.radius * 0.5, a.x, a.y, a.radius * 2.0);
        grad.addColorStop(0, a.element.c);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.radius * 2.0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
        ctx.fillStyle = a.element.c;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(a.x - a.radius*0.3, a.y - a.radius*0.3, a.radius*0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();

        if (a.radius > 8) {
            ctx.fillStyle = '#000';
            ctx.font = `bold ${Math.max(9, a.radius * 0.6)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(a.element.s, a.x, a.y);
            
            if (a.radius > 15) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.font = `${Math.max(7, a.radius * 0.3)}px Inter, sans-serif`;
                ctx.fillText(Math.round(a.mass).toString(), a.x, a.y + a.radius * 0.55);
            }
        }
        
        if (isDraggedGroup || isHovered) {
            ctx.strokeStyle = isDraggedGroup ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.radius + 4, 0, Math.PI * 2);
            ctx.stroke();
            
            if (isDraggedGroup) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(a.x, a.y, a.radius + 8, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    });

    // Draw Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });
};
