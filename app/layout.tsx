import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DMSetu — Instagram automation, made clear",
  description: "Deterministic Instagram comment and DM automations for creators and businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
