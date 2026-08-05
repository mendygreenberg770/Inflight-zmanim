import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inflight Zmanim — Chabad",
  description:
    "In-flight zmanim calculator per the Chabad opinion (tzeis 6°, Baal HaTanya) — pre-flight takeoff charts and live flight tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
