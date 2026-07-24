import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import "./landing.css";

export const metadata: Metadata = {
  title: "Draftspace — Think in shapes",
  description: "A calm infinite canvas for workflows, schemas, and visual thinking — explored in three dimensions.",
};

export default function Landing() {
  return <LandingPage />;
}
