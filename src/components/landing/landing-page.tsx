"use client";

import { useEffect, useRef, useState } from "react";
import { createLandingScene, type LandingScene } from "@/features/landing/scene";
import { createScrollOrchestrator } from "@/features/landing/scroll-orchestrator";
import { LandingSections } from "./landing-sections";

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState<"webgl" | "fallback" | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const flow = flowRef.current;
    const canvas = canvasRef.current;
    if (!root || !flow || !canvas) return;

    document.documentElement.classList.add("landing-scroll");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let scene: LandingScene | null = null;
    try {
      scene = createLandingScene(canvas);
    } catch {
      scene = null;
    }
    const orchestrator = createScrollOrchestrator({ root, flow, scene, reducedMotion });
    setReady(scene ? "webgl" : "fallback");

    return () => {
      orchestrator.dispose();
      scene?.dispose();
      document.documentElement.classList.remove("landing-scroll");
    };
  }, []);

  return (
    <div ref={rootRef} className="landing-root" data-landing-ready={ready ?? undefined}>
      <canvas ref={canvasRef} className="landing-canvas" aria-hidden="true" />
      <div ref={flowRef} className="landing-flow">
        <LandingSections />
      </div>
    </div>
  );
}
