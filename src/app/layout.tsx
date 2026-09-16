import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lost Shipment / POD Dashboard",
  description: "Trust & Safety — Lost Shipment / POD Management Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-ink-900 antialiased">{children}</body>
    </html>
  );
}
