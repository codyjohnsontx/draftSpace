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
    id: "sketch",
    eyebrow: "01 — Sketch",
    heading: "Sketch at the speed of thought.",
    body: "Drop a shape, drag it into place, snap it to the grid. No accounts, no friction — boards live on your machine and load instantly.",
    align: "left",
  },
  {
    id: "connect",
    eyebrow: "02 — Connect",
    heading: "Connect the pieces.",
    body: "Link steps into workflows and schemas. One glowing thread ties the story together, so anyone can follow the flow at a glance.",
    align: "right",
  },
  {
    id: "arrange",
    eyebrow: "03 — Arrange",
    heading: "Order out of chaos.",
    body: "Scattered notes become tidy structure. Alignment, snapping, and clean geometry keep even the messiest thinking presentable.",
    align: "left",
  },
  {
    id: "collaborate",
    eyebrow: "04 — Collaborate",
    heading: "Draft together, live.",
    body: "Share a room code and sketch with up to four people at once — cursors, selections, and all. No sign-up required.",
    align: "right",
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
          <span className="landing-eyebrow">A calm infinite canvas</span>
          <h1>Think in shapes.</h1>
          <p>
            Draftspace turns rough ideas into clear workflows and schemas —
            here, stretched into a third dimension you can fly through.
          </p>
          <span className="landing-scroll-hint" aria-hidden="true">Scroll</span>
        </div>
      </section>

      {SECTIONS.map((section) => (
        <section key={section.id} className="landing-section" data-section={section.id} data-align={section.align}>
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
          <h2>Your canvas is waiting.</h2>
          <p>Everything you just flew over is one click away. Open a board of your own, or hop into a friend&apos;s room.</p>
          <div className="landing-cta-row">
            <Link href="/" className="landing-cta landing-cta--primary">Open the canvas</Link>
            <Link href="/join" className="landing-cta landing-cta--secondary">Join a room</Link>
          </div>
        </div>
      </section>
    </>
  );
}
