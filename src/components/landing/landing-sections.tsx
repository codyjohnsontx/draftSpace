import Link from "next/link";

type SectionCopy = {
  id: string;
  eyebrow: string;
  heading: string;
  body: string;
  align: "left" | "right";
};

const SECTIONS: SectionCopy[] = [
  {
    id: "gather",
    eyebrow: "01 — Gather",
    heading: "Ideas find each other.",
    body: "Drag, sort, group. Loose thoughts drift into themes before you've even named them.",
    align: "right",
  },
  {
    id: "align",
    eyebrow: "02 — Align",
    heading: "Structure clicks into place.",
    body: "Snap to the grid and the noise becomes intent. Suddenly the mess reads like a plan.",
    align: "left",
  },
  {
    id: "design",
    eyebrow: "03 — Design",
    heading: "The system takes shape.",
    body: "Boxes become services. A glowing thread traces one request through gateway, cache, and store — your diagram, running.",
    align: "right",
  },
  {
    id: "discuss",
    eyebrow: "04 — Discuss",
    heading: "Argue it into shape, together.",
    body: "Share a room and redesign live: split the monolith, reroute the flow, and watch the thread follow the argument.",
    align: "left",
  },
];

export function LandingSections() {
  return (
    <>
      <header className="landing-header">
        <span className="landing-wordmark">draftspace</span>
        <Link href="/" className="landing-open-link">Open the canvas</Link>
      </header>

      <section className="landing-section landing-section--hero" data-section="hero">
        <div className="landing-copy landing-copy--hero">
          <span className="landing-eyebrow">A canvas for systems</span>
          <h1>It starts as a mess.</h1>
          <p>
            Every architecture begins as scattered thoughts — boxes, blobs,
            half-ideas. Draftspace gives the mess somewhere to become a system.
          </p>
          <span className="landing-scroll-hint" aria-hidden="true">Scroll</span>
        </div>
      </section>

      {SECTIONS.map((section) => (
        <section
          key={section.id}
          className="landing-section landing-section--tall"
          data-section={section.id}
          data-align={section.align}
        >
          <div className="landing-copy">
            <span className="landing-eyebrow">{section.eyebrow}</span>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </div>
        </section>
      ))}

      <section className="landing-section landing-section--cta" data-section="cta">
        <div className="landing-copy landing-copy--cta">
          <span className="landing-eyebrow">05 — Begin</span>
          <h2>From mess to blueprint.</h2>
          <p>That&apos;s the whole product. Open a board, make your own mess, and we&apos;ll help it click into place.</p>
          <div className="landing-cta-row">
            <Link href="/" className="landing-cta landing-cta--primary">Open the canvas</Link>
            <Link href="/join" className="landing-cta landing-cta--secondary">Join a room</Link>
          </div>
        </div>
      </section>
    </>
  );
}
