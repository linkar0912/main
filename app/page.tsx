import Link from "next/link";
import type { Metadata } from "next";

export function generateMetadata(): Metadata {
  return {
    title: "Linkar",
    description: "Conversation automation made clear.",
  };
}

export default function HomePage() {
  return (
    <main>
      <h1>Linkar</h1>
      <p>Linkar turns conversations into momentum.</p>
      <Link href="/signup">Get started</Link>
    </main>
  );
}
