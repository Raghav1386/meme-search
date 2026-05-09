import React, { useEffect, useRef } from 'react';

export default function BackgroundCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // Performance optimization
    
    let width, height;
    let grid = []; // 2D array for spatial partitioning
    const spacing = 50; // Increased spacing for performance
    let animationFrameId;
    
    let time = 0;
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    const initCanvas = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      grid = [];
      
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      for(let x = 0; x < cols; x++) {
        grid[x] = [];
        for(let y = 0; y < rows; y++) {
          grid[x][y] = {
            x: x * spacing,
            y: y * spacing,
            baseX: x * spacing,
            baseY: y * spacing,
            offset: Math.random() * Math.PI * 2,
            speed: 0.01 + Math.random() * 0.02,
            pulse: Math.random() * 100
          };
        }
      }
    };

    const handleMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const drawBackground = () => {
      ctx.fillStyle = '#070709';
      ctx.fillRect(0, 0, width, height);
      
      time += 0.008;

      const cols = grid.length;
      const rows = grid[0]?.length || 0;

      // Pre-calculate common values
      const sinTime = Math.sin(time);
      const cosTime = Math.cos(time);

      // Hoist stroke style for connections
      ctx.lineWidth = 1;

      for(let x = 0; x < cols; x++) {
        for(let y = 0; y < rows; y++) {
          const p = grid[x][y];
          
          const sinOff = Math.sin(time + p.offset);
          const cosOff = Math.cos(time + p.offset);
          
          p.x = p.baseX + sinOff * 3;
          p.y = p.baseY + cosOff * 3;
          p.pulse += p.speed;

          const dx = mouseX - p.x;
          const dy = mouseY - p.y;
          const distSq = dx*dx + dy*dy;
          const maxDist = 200;
          const maxDistSq = 40000; // Pre-calculated maxDist * maxDist
          
          let opacity = (Math.sin(p.pulse) * 0.5 + 0.5) * 0.1;
          let size = 1;
          
          if (distSq < maxDistSq) {
            const dist = Math.sqrt(distSq);
            const ratio = (maxDist - dist) / maxDist;
            opacity += ratio * 0.4;
            size += ratio * 1.5;
            
            const strokeAlpha = ratio * 0.15;
            
            if (x < cols - 1) {
              const p2 = grid[x+1][y];
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.baseX + Math.sin(time + p2.offset) * 3, p2.baseY + Math.cos(time + p2.offset) * 3);
              ctx.strokeStyle = `rgba(255, 74, 28, ${strokeAlpha})`;
              ctx.stroke();
            }
            
            if (y < rows - 1) {
              const p2 = grid[x][y+1];
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.baseX + Math.sin(time + p2.offset) * 3, p2.baseY + Math.cos(time + p2.offset) * 3);
              ctx.strokeStyle = `rgba(255, 74, 28, ${strokeAlpha})`;
              ctx.stroke();
            }
          }

          ctx.fillStyle = `rgba(244, 244, 245, ${opacity})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, 6.283185307179586); // Pre-calculated Math.PI * 2
          ctx.fill();
        }
      }

      // Optimized data beams: Create gradient once
      const beamSpacing = 300;
      let xPos = (time * 60) % beamSpacing;
      
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(255, 74, 28, 0)');
      grad.addColorStop(0.5, 'rgba(255, 74, 28, 0.02)');
      grad.addColorStop(1, 'rgba(255, 74, 28, 0)');
      ctx.fillStyle = grad;

      while (xPos < width) {
        ctx.fillRect(xPos, 0, 1, height);
        xPos += beamSpacing;
      }

      animationFrameId = requestAnimationFrame(drawBackground);
    };

    window.addEventListener('resize', initCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    
    initCanvas();
    drawBackground();

    return () => {
      window.removeEventListener('resize', initCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 w-full h-full pointer-events-none z-0 opacity-60"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}