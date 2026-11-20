"use client";

import { useEffect, useRef, useState } from "react";

export function ForestBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    let animId: number;
    let t = 0;

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    // Pre-render a forest-like noise texture
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % w;
      const y = Math.floor((i / 4) / w);
      const n =
        Math.sin(x * 0.008 + y * 0.006) * 0.5 +
        Math.sin(x * 0.015 - y * 0.012 + 2.0) * 0.3 +
        Math.sin(x * 0.003 + y * 0.005 + 1.5) * 0.8;
      const noise = (n + 1.6) / 3.2;
      // Deep forest colors
      const r = Math.floor(10 + noise * 25);
      const g = Math.floor(20 + noise * 60);
      const b = Math.floor(18 + noise * 45);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    const render = () => {
      t += 0.003;
      // Gradient overlays
      const grad1 = ctx.createRadialGradient(
        w * 0.3 + Math.sin(t * 0.7) * 80,
        h * 0.25 + Math.cos(t * 0.5) * 60,
        0,
        w * 0.3,
        h * 0.25,
        w * 0.7,
      );
      grad1.addColorStop(0, "rgba(39, 82, 75, 0.18)");
      grad1.addColorStop(0.5, "rgba(23, 50, 46, 0.06)");
      grad1.addColorStop(1, "rgba(10, 20, 18, 0)");
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, w, h);

      const grad2 = ctx.createRadialGradient(
        w * 0.75 + Math.cos(t * 0.4) * 100,
        h * 0.6 + Math.sin(t * 0.3) * 50,
        0,
        w * 0.75,
        h * 0.6,
        w * 0.5,
      );
      grad2.addColorStop(0, "rgba(143, 184, 174, 0.06)");
      grad2.addColorStop(0.6, "rgba(23, 50, 46, 0.02)");
      grad2.addColorStop(1, "rgba(10, 20, 18, 0)");
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, w, h);

      // Light rays
      ctx.save();
      ctx.globalAlpha = 0.025 + Math.sin(t * 0.3) * 0.01;
      for (let i = 0; i < 5; i++) {
        const x = w * (0.2 + i * 0.15) + Math.sin(t * 0.2 + i) * 40;
        const grad = ctx.createLinearGradient(x, 0, x + 60, h);
        grad.addColorStop(0, "rgba(143, 184, 174, 0.15)");
        grad.addColorStop(1, "rgba(10, 20, 18, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, 60, h);
      }
      ctx.restore();

      // Vignette
      const vig = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.2,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.8,
      );
      vig.addColorStop(0, "rgba(10, 20, 18, 0)");
      vig.addColorStop(1, "rgba(10, 20, 18, 0.7)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      animId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, [mounted]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 h-screen w-screen"
      style={{ background: "#0A1412" }}
    />
  );
}
