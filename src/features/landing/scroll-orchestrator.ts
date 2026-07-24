import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import type { LandingScene } from "./scene";

export type ScrollOrchestrator = { dispose(): void };

export function createScrollOrchestrator(options: {
  root: HTMLElement;
  flow: HTMLElement;
  scene: LandingScene | null;
  reducedMotion: boolean;
}): ScrollOrchestrator {
  const { root, flow, scene, reducedMotion } = options;

  if (reducedMotion || !scene) {
    // Static composition: full world with the path fully drawn, normal document scroll.
    scene?.setProgress(1);
    scene?.render(0);
    return { dispose() {} };
  }

  gsap.registerPlugin(ScrollTrigger);
  const lenis = new Lenis();
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number) => {
    lenis.raf(time * 1000);
    scene.render(time);
  };
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  const context = gsap.context(() => {
    const proxy = { value: 0 };
    gsap.to(proxy, {
      value: 1,
      ease: "none",
      scrollTrigger: { trigger: flow, start: "top top", end: "bottom bottom", scrub: true },
      onUpdate: () => scene.setProgress(proxy.value),
    });

    for (const copy of gsap.utils.toArray<HTMLElement>(".landing-copy", flow)) {
      gsap.from(copy, {
        autoAlpha: 0,
        y: 46,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: copy, start: "top 80%", toggleActions: "play none none reverse" },
      });
    }
  }, root);

  scene.setProgress(0);
  scene.render(0);

  return {
    dispose() {
      context.revert();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33); // GSAP defaults — lagSmoothing(0) above is only wanted while Lenis drives the ticker
      lenis.destroy();
    },
  };
}
