/**
 * Blockchain Network Particle Effect
 * Interactive canvas animation with nodes and connections
 */

class ParticleNetwork {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: null, y: null, radius: 150 };
        this.particleCount = 80;
        this.maxDistance = 120;
        this.colors = {
            particle: '#0ea5e9',
            line: 'rgba(14, 165, 233, 0.15)',
            lineHover: 'rgba(34, 211, 238, 0.4)',
            glow: 'rgba(14, 165, 233, 0.5)'
        };
        
        this.init();
        this.animate();
        this.addEventListeners();
    }
    
    init() {
        this.resize();
        this.createParticles();
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1,
                opacity: Math.random() * 0.5 + 0.3
            });
        }
    }
    
    addEventListeners() {
        window.addEventListener('resize', () => {
            this.resize();
            this.createParticles();
        });
        
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        window.addEventListener('mouseout', () => {
            this.mouse.x = null;
            this.mouse.y = null;
        });
    }
    
    drawParticle(p) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = this.colors.particle;
        this.ctx.globalAlpha = p.opacity;
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
    }
    
    drawLine(p1, p2, distance, isMouseNear) {
        const opacity = 1 - (distance / this.maxDistance);
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        
        if (isMouseNear) {
            this.ctx.strokeStyle = this.colors.lineHover;
            this.ctx.lineWidth = 1.5;
        } else {
            this.ctx.strokeStyle = this.colors.line;
            this.ctx.lineWidth = 0.8;
        }
        
        this.ctx.globalAlpha = opacity * 0.6;
        this.ctx.stroke();
        this.ctx.globalAlpha = 1;
    }
    
    drawMouseConnections(p, distance) {
        if (distance < this.mouse.radius) {
            const opacity = 1 - (distance / this.mouse.radius);
            this.ctx.beginPath();
            this.ctx.moveTo(p.x, p.y);
            this.ctx.lineTo(this.mouse.x, this.mouse.y);
            this.ctx.strokeStyle = this.colors.lineHover;
            this.ctx.lineWidth = 1.5;
            this.ctx.globalAlpha = opacity * 0.8;
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
            
            // Draw glow at connection point
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2);
            this.ctx.fillStyle = this.colors.glow;
            this.ctx.globalAlpha = opacity * 0.5;
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        }
    }
    
    update() {
        this.particles.forEach(p => {
            // Move particle
            p.x += p.vx;
            p.y += p.vy;
            
            // Bounce off edges
            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;
            
            // Keep in bounds
            p.x = Math.max(0, Math.min(this.canvas.width, p.x));
            p.y = Math.max(0, Math.min(this.canvas.height, p.y));
            
            // Slight attraction to mouse
            if (this.mouse.x !== null && this.mouse.y !== null) {
                const dx = this.mouse.x - p.x;
                const dy = this.mouse.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < this.mouse.radius * 2) {
                    p.vx += dx * 0.00005;
                    p.vy += dy * 0.00005;
                    
                    // Limit velocity
                    const maxV = 1.5;
                    p.vx = Math.max(-maxV, Math.min(maxV, p.vx));
                    p.vy = Math.max(-maxV, Math.min(maxV, p.vy));
                }
            }
        });
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw connections between particles
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const p1 = this.particles[i];
                const p2 = this.particles[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < this.maxDistance) {
                    // Check if mouse is near either particle
                    let isMouseNear = false;
                    if (this.mouse.x !== null && this.mouse.y !== null) {
                        const d1 = Math.sqrt(Math.pow(p1.x - this.mouse.x, 2) + Math.pow(p1.y - this.mouse.y, 2));
                        const d2 = Math.sqrt(Math.pow(p2.x - this.mouse.x, 2) + Math.pow(p2.y - this.mouse.y, 2));
                        isMouseNear = d1 < this.mouse.radius || d2 < this.mouse.radius;
                    }
                    this.drawLine(p1, p2, distance, isMouseNear);
                }
            }
        }
        
        // Draw particles and mouse connections
        this.particles.forEach(p => {
            this.drawParticle(p);
            
            if (this.mouse.x !== null && this.mouse.y !== null) {
                const dx = p.x - this.mouse.x;
                const dy = p.y - this.mouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                this.drawMouseConnections(p, distance);
            }
        });
    }
    
    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('particleCanvas');
    if (canvas) {
        new ParticleNetwork(canvas);
    }
});
