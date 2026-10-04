import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Our Wedding Roll",
  description: "A private shared wedding camera.",
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#171512",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser remote-inspection tooling may add attributes to <html> before hydration.
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
