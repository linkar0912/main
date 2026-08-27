import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Linkar</h1>
      <p>Build better Instagram conversations.</p>
      <Link href="/signup">Get started</Link>
    </main>
  );
}
