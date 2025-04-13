"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Head from "next/head";
import { ArrowLeft, ArrowRight, Cross, Moon, Save, Sun, X } from "lucide-react";

type BrushStyle = "ripple" | "pulse" | "particle";
type ColorPalette = "aurora" | "galaxy" | "ocean";

interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

interface Stroke {
  points: StrokePoint[];
  brush: BrushStyle;
  color: string;
  size: number;
}

const LightPainter = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tempStroke, setTempStroke] = useState<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [brushSize, setBrushSize] = useState(30);
  const [brushStyle, setBrushStyle] = useState<BrushStyle>("ripple");
  const [colorPalette, setColorPalette] = useState<ColorPalette>("aurora");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [darkMode, setDarkMode] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ambientSound, setAmbientSound] = useState("none");
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const palettes: Record<ColorPalette, string[]> = {
    aurora: ["#50E3C2", "#79FFE1", "#4A90E2", "#B8E986", "#9013FE"],
    galaxy: ["#4B0082", "#9400D3", "#00BFFF", "#1E90FF", "#FF69B4"],
    ocean: ["#0077BE", "#00B4D8", "#90E0EF", "#CAF0F8", "#03045E"],
  };

  useEffect(() => {
    setSelectedColor(palettes[colorPalette][0]);
  }, [colorPalette]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const context = canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: false,
    });
    if (context) {
      context.scale(dpr, dpr);

      context.globalCompositeOperation = "lighter";

      context.lineJoin = "round";
      context.lineCap = "round";

      setCtx(context);
    }
  }, []);

  useEffect(() => {
    initCanvas();

    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        initCanvas();

        if (ctx && canvasRef.current) {
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
          strokes.forEach((stroke) => drawBrush(stroke, ctx));
        }
      }, 250);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimer);
    };
  }, [initCanvas, strokes, ctx]);

  useEffect(() => {
    let audioInitialized = false;

    const initAudio = () => {
      if (audioInitialized || ambientSound === "none") return;

      try {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        audioInitialized = true;
      } catch (error) {
        console.error("Web Audio API is not supported in this browser");
      }
    };

    const soundSelector = document.getElementById("ambientSound");
    if (soundSelector) {
      soundSelector.addEventListener("change", initAudio);
    }

    return () => {
      if (soundSelector) {
        soundSelector.removeEventListener("change", initAudio);
      }

      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect();
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (ambientSound === "none") {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }
      return;
    }

    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      } catch (error) {
        console.error("Web Audio API is not supported in this browser", error);
        return;
      }
    }

    const playAmbientSound = async () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }

      const audioElement = new Audio();

      switch (ambientSound) {
        case "wind":
          audioElement.src =
            "https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3";
          break;
        case "underwater":
          audioElement.src =
            "https://assets.mixkit.co/active_storage/sfx/1189/1189-preview.mp3";
          break;
        case "softPiano":
          audioElement.src =
            "https://assets.mixkit.co/active_storage/sfx/212/212-preview.mp3";
          break;
        default:
          break;
      }

      audioElement.crossOrigin = "anonymous";
      audioElement.loop = true;

      audioElementRef.current = audioElement;

      try {
        if (audioContextRef.current && audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume();
        }
        await audioElement.play();
      } catch (error) {
        console.error(
          "Error playing ambient sound – make sure this is triggered by a user gesture.",
          error
        );
      }
    };

    playAmbientSound();

    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
    };
  }, [ambientSound]);

  const interpolatePoints = (
    p1: StrokePoint,
    p2: StrokePoint,
    steps = 5
  ): StrokePoint[] => {
    const points: StrokePoint[] = [];
    const timeStep = (p2.timestamp - p1.timestamp) / steps;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
        pressure: p1.pressure + (p2.pressure - p1.pressure) * t,
        timestamp: p1.timestamp + timeStep * i,
      });
    }

    return points;
  };

  const drawBrush = useCallback(
    (stroke: Stroke, context = ctx) => {
      if (!context || stroke.points.length < 2) return;

      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";

      context.shadowBlur = stroke.size * 0.5;
      context.shadowColor = stroke.color;

      const pointsToRender =
        stroke.points.length > 200
          ? stroke.points.filter(
              (_, i) => i % 2 === 0 || i === stroke.points.length - 1
            )
          : stroke.points;

      switch (stroke.brush) {
        case "ripple":
          const rippleTime = performance.now() * 0.001;
          const rippleScale = 0.8 + 0.2 * Math.sin(rippleTime * 2);

          context.beginPath();
          context.moveTo(pointsToRender[0].x, pointsToRender[0].y);

          for (let i = 1; i < pointsToRender.length; i++) {
            const point = pointsToRender[i];
            const scaledWidth = stroke.size * point.pressure * rippleScale;

            if (i % 5 === 0 || i === pointsToRender.length - 1) {
              context.lineWidth = scaledWidth;
            }

            context.lineTo(point.x, point.y);
          }

          context.strokeStyle = stroke.color;
          context.stroke();

          if (pointsToRender.length > 10) {
            context.beginPath();
            const step = Math.max(1, Math.floor(pointsToRender.length / 10));

            for (let i = 0; i < pointsToRender.length; i += step) {
              const point = pointsToRender[i];
              if (i === 0) {
                context.moveTo(point.x, point.y);
              } else {
                context.lineTo(point.x, point.y);
              }
            }

            const lastPoint = pointsToRender[pointsToRender.length - 1];
            context.lineTo(lastPoint.x, lastPoint.y);

            context.lineWidth = stroke.size * 0.4 * rippleScale;
            context.strokeStyle = adjustColorBrightness(stroke.color, 1.2);
            context.stroke();
          }
          break;

        case "pulse":
          const pulseTime = performance.now() * 0.003;
          const pulseScale = 0.8 + 0.4 * Math.sin(pulseTime);

          context.beginPath();
          context.moveTo(pointsToRender[0].x, pointsToRender[0].y);

          for (let i = 1; i < pointsToRender.length; i++) {
            context.lineTo(pointsToRender[i].x, pointsToRender[i].y);
          }

          context.lineWidth = stroke.size * pulseScale;
          context.strokeStyle = stroke.color;
          context.stroke();

          context.beginPath();
          context.moveTo(pointsToRender[0].x, pointsToRender[0].y);

          for (let i = 1; i < pointsToRender.length; i += 2) {
            context.lineTo(pointsToRender[i].x, pointsToRender[i].y);
          }

          context.lineWidth = stroke.size * pulseScale * 1.5;
          context.strokeStyle = setColorOpacity(stroke.color, 0.3);
          context.stroke();
          break;

        case "particle":
          const particleSpacing = Math.max(
            4,
            Math.floor(pointsToRender.length / 40)
          );

          for (let i = 0; i < pointsToRender.length; i += particleSpacing) {
            const point = pointsToRender[i];
            const particleSize = stroke.size * point.pressure * 0.5;

            context.beginPath();
            context.fillStyle = stroke.color;
            context.arc(point.x, point.y, particleSize, 0, Math.PI * 2);
            context.fill();

            if (i % (particleSpacing * 2) === 0) {
              for (let j = 0; j < 2; j++) {
                const angle = j * Math.PI + i * 0.1;
                const distance = particleSize * 0.7;

                const particleX = point.x + Math.cos(angle) * distance;
                const particleY = point.y + Math.sin(angle) * distance;

                context.beginPath();
                context.arc(
                  particleX,
                  particleY,
                  particleSize * 0.4,
                  0,
                  Math.PI * 2
                );
                context.fillStyle = stroke.color;
                context.globalAlpha = 0.6;
                context.fill();
              }
              context.globalAlpha = 1.0;
            }
          }
          break;
      }

      context.restore();
    },
    [ctx]
  );

  const adjustColorBrightness = (color: string, factor: number): string => {
    let r = parseInt(color.slice(1, 3), 16);
    let g = parseInt(color.slice(3, 5), 16);
    let b = parseInt(color.slice(5, 7), 16);

    r = Math.min(255, Math.round(r * factor));
    g = Math.min(255, Math.round(g * factor));
    b = Math.min(255, Math.round(b * factor));

    return `#${r.toString(16).padStart(2, "0")}${g
      .toString(16)
      .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };

  const setColorOpacity = (color: string, opacity: number): string => {
    let r = parseInt(color.slice(1, 3), 16);
    let g = parseInt(color.slice(3, 5), 16);
    let b = parseInt(color.slice(5, 7), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  const shiftHue = (color: string, amount: number): string => {
    let r = parseInt(color.slice(1, 3), 16) / 255;
    let g = parseInt(color.slice(3, 5), 16) / 255;
    let b = parseInt(color.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
        default:
          h = 0;
      }

      h /= 6;
    }

    h = (h * 360 + amount) % 360;
    if (h < 0) h += 360;
    h /= 360;

    let r1, g1, b1;

    if (s === 0) {
      r1 = g1 = b1 = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      r1 = hue2rgb(p, q, h + 1 / 3);
      g1 = hue2rgb(p, q, h);
      b1 = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
  };

  const animate = useCallback(() => {
    if (!ctx || !canvasRef.current) return;

    const now = performance.now();
    const elapsed = now - lastTimeRef.current;

    if (elapsed < 16) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    lastTimeRef.current = now;

    const canvasWidth = canvasRef.current.width / window.devicePixelRatio;
    const canvasHeight = canvasRef.current.height / window.devicePixelRatio;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (tempStroke) {
      if (strokes.length > 0) {
        ctx.globalAlpha = 0.95;
        strokes.forEach((stroke) => {
          if (stroke.points.length < 2) return;

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.shadowBlur = stroke.size * 0.5;
          ctx.shadowColor = stroke.color;
          ctx.strokeStyle = stroke.color;

          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }

          ctx.lineWidth = stroke.size * 0.8;
          ctx.stroke();
          ctx.restore();
        });
        ctx.globalAlpha = 1.0;
      }

      drawBrush(tempStroke);
    } else {
      strokes.forEach((stroke) => drawBrush(stroke));
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [ctx, strokes, tempStroke, drawBrush, darkMode]);

  useEffect(() => {
    lastTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);

  const smoothInput = (
    point: { x: number; y: number },
    pressure: number
  ): { x: number; y: number; pressure: number } => {
    if (!lastPointRef.current) {
      lastPointRef.current = point;
      return { ...point, pressure };
    }

    const alpha = 0.7;
    const smoothedX = alpha * point.x + (1 - alpha) * lastPointRef.current.x;
    const smoothedY = alpha * point.y + (1 - alpha) * lastPointRef.current.y;

    lastPointRef.current = { x: smoothedX, y: smoothedY };
    return { x: smoothedX, y: smoothedY, pressure };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 1;
    const timestamp = Date.now();

    const strokeColor = selectedColor;

    lastPointRef.current = null;

    const smoothedInput = smoothInput({ x, y }, pressure);

    const newStroke: Stroke = {
      points: [
        {
          x: smoothedInput.x,
          y: smoothedInput.y,
          pressure: smoothedInput.pressure,
          timestamp,
        },
      ],
      brush: brushStyle,
      color: strokeColor,
      size: brushSize,
    };

    setTempStroke(newStroke);
    setIsDrawing(true);

    setRedoStack([]);
  };

  const lastMoveTimeRef = useRef<number>(0);
  const moveThrottleRef = useRef<number>(16);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !tempStroke || !canvasRef.current) return;

    const now = Date.now();
    if (now - lastMoveTimeRef.current < moveThrottleRef.current) {
      return;
    }
    lastMoveTimeRef.current = now;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 1;
    const timestamp = now;

    const smoothedInput = smoothInput({ x, y }, pressure);

    if (
      tempStroke.points.length > 100 &&
      tempStroke.points[tempStroke.points.length - 1].timestamp > now - 1000
    ) {
      moveThrottleRef.current = Math.min(32, moveThrottleRef.current + 2);
    } else {
      moveThrottleRef.current = Math.max(16, moveThrottleRef.current - 1);
    }

    setTempStroke((prev) =>
      prev
        ? {
            ...prev,

            points: [
              ...prev.points,
              {
                x: smoothedInput.x,
                y: smoothedInput.y,
                pressure: smoothedInput.pressure,
                timestamp,
              },
            ],
          }
        : null
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !tempStroke) return;

    e.currentTarget.releasePointerCapture(e.pointerId);

    if (tempStroke.points.length > 1) {
      let optimizedStroke = { ...tempStroke };

      if (tempStroke.points.length > 500) {
        const simplificationFactor = Math.ceil(tempStroke.points.length / 500);
        optimizedStroke.points = tempStroke.points.filter(
          (_, i) =>
            i % simplificationFactor === 0 || i === tempStroke.points.length - 1
        );
      }

      setStrokes((prev) => [...prev, optimizedStroke]);
    }

    setTempStroke(null);
    setIsDrawing(false);

    lastPointRef.current = null;

    moveThrottleRef.current = 16;
  };

  const handleUndo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const newStrokes = [...prev];
      const removedStroke = newStrokes.pop()!;
      setRedoStack((redo) => [...redo, removedStroke]);
      return newStrokes;
    });
  };

  const handleRedo = () => {
    setRedoStack((redo) => {
      if (redo.length === 0) return redo;
      const newRedo = [...redo];
      const strokeToRedo = newRedo.pop()!;
      setStrokes((prev) => [...prev, strokeToRedo]);
      return newRedo;
    });
  };

  const handleClear = () => {
    if (canvasRef.current && ctx) {
      const width = canvasRef.current.width / window.devicePixelRatio;
      const height = canvasRef.current.height / window.devicePixelRatio;

      ctx.save();
      ctx.fillStyle = darkMode
        ? "rgba(255, 255, 255, 0.2)"
        : "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      setTimeout(() => {
        if (ctx && canvasRef.current) {
          ctx.clearRect(0, 0, width, height);
        }
      }, 100);
    }

    setStrokes([]);
    setRedoStack([]);
  };

  const handleSave = () => {
    if (!canvasRef.current) return;

    if (ctx) {
      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(
        0,
        0,
        canvasRef.current.width / window.devicePixelRatio,
        canvasRef.current.height / window.devicePixelRatio
      );
      ctx.restore();

      setTimeout(() => {
        if (!canvasRef.current) return;

        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");

        if (!tempCtx) return;

        tempCanvas.width = canvasRef.current.width;
        tempCanvas.height = canvasRef.current.height;

        tempCtx.fillStyle = darkMode ? "#121212" : "#ffffff";
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        tempCtx.drawImage(canvasRef.current, 0, 0);

        const dataUrl = tempCanvas.toDataURL("image/png");
        const link = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        link.download = `light_painting_${timestamp}.png`;
        link.href = dataUrl;
        link.click();

        showSaveNotification();
      }, 100);
    }
  };

  const [showSaveMessage, setShowSaveMessage] = useState(false);

  const showSaveNotification = () => {
    setShowSaveMessage(true);
    setTimeout(() => setShowSaveMessage(false), 2000);
  };

  const toggleControls = () => {
    setShowControls((prev) => !prev);
  };

  return (
    <div
      className={`min-h-screen w-full overflow-hidden relative transition-colors duration-500 ${
        darkMode
          ? "bg-gradient-to-br from-gray-900 to-black"
          : "bg-gradient-to-br from-slate-50 to-gray-100"
      }`}
    >
      <Head>
        <title>Light Painter</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap");

        * {
          font-family: "Poppins", sans-serif;
          box-sizing: border-box;
        }

        body {
          overflow: hidden;
          margin: 0;
          padding: 0;
        }

        @keyframes simple-glow {
          0%,
          100% {
            box-shadow: 0 0 5px currentColor;
          }
          50% {
            box-shadow: 0 0 12px currentColor;
          }
        }

        @keyframes simple-pulse {
          0%,
          100% {
            transform: scale(0.98);
          }
          50% {
            transform: scale(1.02);
          }
        }

        @keyframes simple-ripple {
          0% {
            box-shadow: 0 0 0 0px rgba(255, 255, 255, 0.2);
          }
          100% {
            box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
          }
        }

        @keyframes simple-particle {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        .enhanced-glow-effect {
          animation: simple-glow 2s infinite;
          will-change: box-shadow;
        }

        .enhanced-pulse-effect {
          animation: simple-pulse 2s infinite;
          will-change: transform;
        }

        .enhanced-ripple-effect {
          animation: simple-ripple 1.5s infinite;
          will-change: box-shadow;
        }

        .enhanced-particle-effect {
          animation: simple-particle 2s infinite;
          will-change: transform;
        }

        .control-panel {
          backdrop-filter: blur(8px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: transform 0.3s ease-out;
          will-change: transform;
        }

        .control-panel-dark {
          background: rgba(17, 17, 17, 0.8);
        }

        .control-panel-light {
          background: rgba(250, 250, 250, 0.85);
        }

        select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          background-size: 12px;
          padding-right: 30px !important;
          cursor: pointer;
        }

        input[type="range"] {
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 8px;
          outline: none;
        }

        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: linear-gradient(to right, #4f46e5, #8b5cf6);
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
          cursor: pointer;
        }

        .btn {
          transition: transform 0.2s ease, background-color 0.2s ease;
        }

        .btn:hover {
          transform: translateY(-1px);
        }

        .btn:active {
          transform: translateY(1px);
        }

        .color-item {
          transition: transform 0.15s ease;
          cursor: pointer;
        }

        .color-item:hover {
          transform: scale(1.1);
        }

        .color-item.selected {
          transform: scale(1.2);
          box-shadow: 0 0 0 2px white;
        }

        @keyframes fadeSimple {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          15% {
            opacity: 1;
            transform: translateY(0);
          }
          85% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-10px);
          }
        }

        .save-notification {
          animation: fadeSimple 1.5s ease-in-out forwards;
          will-change: opacity, transform;
        }
      `}</style>

      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      <button
        suppressHydrationWarning={true}
        onClick={toggleControls}
        className={`fixed md:hidden top-4 right-4 z-50 p-3 rounded-full shadow-lg transform transition-transform ${
          darkMode ? "bg-gray-800 text-white" : "bg-white text-gray-800"
        } hover:scale-105 active:scale-95`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={
              showControls
                ? "M6 18L18 6M6 6l12 12"
                : "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            }
          />
          {!showControls && (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          )}
        </svg>
      </button>

      <div
        className={`fixed top-0 md:top-6 left-0 md:left-6 h-full md:h-auto w-72 md:w-80 max-w-full md:max-w-xs md:rounded-xl z-40 p-6 transition-all duration-500 ease-in-out control-panel ${
          darkMode
            ? "control-panel-dark text-white"
            : "control-panel-light text-gray-800"
        } ${
          showControls ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="text-center mb-6">
          <h1 className="font-bold text-2xl bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-pink-500">
            Light Painter
          </h1>
          <p
            className={`text-xs mt-1 ${
              darkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            Create stunning light art
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          <button
            suppressHydrationWarning={true}
            className={`btn col-span-1 p-2 cursor-pointer rounded-lg ${
              darkMode
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-gray-200 hover:bg-gray-300"
            } flex items-center justify-center`}
            onClick={handleUndo}
            title="Undo"
            disabled={strokes.length === 0}
          >
            <ArrowLeft className="h-5 w-5 text-gray-400 hover:text-gray-800" />
          </button>
          <button
            suppressHydrationWarning={true}
            className={`btn col-span-1 p-2 cursor-pointer rounded-lg ${
              darkMode
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-gray-200 hover:bg-gray-300"
            } flex items-center justify-center`}
            onClick={handleRedo}
            title="Redo"
            disabled={redoStack.length === 0}
          >
            <ArrowRight className="h-5 w-5 text-gray-400 hover:text-gray-800" />
          </button>
          <button
            suppressHydrationWarning={true}
            className={`btn col-span-1 p-2 cursor-pointer rounded-lg ${
              darkMode
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-gray-200 hover:bg-gray-300"
            } flex items-center justify-center`}
            onClick={handleClear}
            title="Clear Canvas"
            disabled={strokes.length === 0}
          >
            <X className="h-5 w-5 text-gray-400 hover:text-gray-800" />
          </button>
          <button
            suppressHydrationWarning={true}
            className={`btn col-span-1 p-2 cursor-pointer rounded-lg ${
              darkMode
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-gray-200 hover:bg-gray-300"
            } flex items-center justify-center`}
            onClick={handleSave}
            title="Save Artwork"
          >
            <Save className="h-5 w-5 text-gray-400 hover:text-gray-800" />
          </button>
        </div>

        <div className="mb-5">
          <label
            className="block mb-2 font-medium text-sm"
            htmlFor="brushStyle"
          >
            Brush Style:
          </label>
          <select
            suppressHydrationWarning={true}
            id="brushStyle"
            value={brushStyle}
            onChange={(e) => setBrushStyle(e.target.value as BrushStyle)}
            className={`w-full p-2.5 rounded-lg border ${
              darkMode
                ? "bg-gray-700 border-gray-600 text-white"
                : "bg-white border-gray-300 text-gray-800"
            } focus:ring-2 focus:ring-purple-500 outline-none transition-all`}
          >
            <option value="ripple">Ripple</option>
            <option value="pulse">Pulse</option>
            <option value="particle">Particle</option>
          </select>
        </div>

        <div className="mb-5">
          <label
            className="block mb-2 font-medium text-sm"
            htmlFor="colorPalette"
          >
            Color Palette:
          </label>
          <select
            suppressHydrationWarning={true}
            id="colorPalette"
            value={colorPalette}
            onChange={(e) => setColorPalette(e.target.value as ColorPalette)}
            className={`w-full p-2.5 rounded-lg border ${
              darkMode
                ? "bg-gray-700 border-gray-600 text-white"
                : "bg-white border-gray-300 text-gray-800"
            } focus:ring-2 focus:ring-purple-500 outline-none transition-all`}
          >
            <option value="aurora">Aurora</option>
            <option value="galaxy">Galaxy</option>
            <option value="ocean">Ocean</option>
          </select>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="font-medium text-sm" htmlFor="brushSize">
              Brush Size:
            </label>
            <span
              className={`text-sm ${
                darkMode ? "text-gray-300" : "text-gray-600"
              }`}
            >
              {brushSize}px
            </span>
          </div>
          <input
            id="brushSize"
            type="range"
            min="5"
            max="100"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
            className={`w-full ${darkMode ? "bg-gray-700" : "bg-gray-200"}`}
          />
        </div>

        <div className="mb-5">
          <label
            className="block mb-2 font-medium text-sm"
            htmlFor="ambientSound"
          >
            Ambient Soundscape:
          </label>
          <select
            suppressHydrationWarning={true}
            id="ambientSound"
            value={ambientSound}
            onChange={(e) => setAmbientSound(e.target.value)}
            className={`w-full p-2.5 rounded-lg border ${
              darkMode
                ? "bg-gray-700 border-gray-600 text-white"
                : "bg-white border-gray-300 text-gray-800"
            } focus:ring-2 focus:ring-purple-500 outline-none transition-all`}
          >
            <option value="none">None</option>
            <option value="wind">Gentle Wind</option>
            <option value="underwater">Underwater Ambience</option>
            <option value="softPiano">Soft Piano</option>
          </select>
        </div>

        <div className="mb-5">
          <p className="block mb-2 font-medium text-sm">Select Color:</p>
          <div className="flex flex-wrap gap-2 py-1">
            {palettes[colorPalette].map((color, index) => (
              <div
                key={index}
                className={`w-8 h-8 rounded-full enhanced-glow-effect color-item ${
                  selectedColor === color ? "selected" : ""
                }`}
                style={{
                  backgroundColor: color,
                  color: color,
                }}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>
        </div>

        <button
          suppressHydrationWarning={true}
          className={`btn w-full cursor-pointer p-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
            darkMode
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              : "bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600"
          } text-white font-medium shadow-lg`}
          onClick={() => setDarkMode(!darkMode)}
        >
          {darkMode ? (
            <>
              <Sun className="h-5 w-5" />
              <span>Switch to Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="h-5 w-5" />
              <span>Switch to Dark Mode</span>
            </>
          )}
        </button>
      </div>

      {strokes.length > 0 && (
        <div
          className={`fixed bottom-6 right-6 p-4 rounded-lg z-30 transition-all duration-300 ${
            darkMode ? "bg-gray-800/85 text-white" : "bg-white/85 text-gray-800"
          } backdrop-blur-md shadow-lg border border-gray-700/20`}
        >
          <p className="text-sm font-medium">Artwork Stats</p>
          <p className="text-xs opacity-80">Strokes: {strokes.length}</p>
          <p className="text-xs opacity-80">Current Palette: {colorPalette}</p>
          <p className="text-xs opacity-80">Brush: {brushStyle}</p>
        </div>
      )}

      <div
        className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 p-4 rounded-lg z-30 text-center transition-opacity duration-500 ${
          isDrawing || strokes.length > 3 ? "opacity-0" : "opacity-100"
        } ${
          darkMode ? "bg-gray-800/85 text-white" : "bg-white/85 text-gray-800"
        } backdrop-blur-md shadow-lg hidden md:block`}
      >
        <p className="text-sm font-medium">Create Your Light Painting</p>
        <p className="text-xs opacity-80 max-w-xs">
          Draw with your mouse or touch to create glowing art
        </p>
      </div>

      {showSaveMessage && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 save-notification">
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Artwork saved successfully!</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LightPainter;