import type { Metadata, Viewport } from "next";
import { Jost, Plus_Jakarta_Sans, Noto_Sans_Malayalam } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
const jost = Jost({ variable: "--font-jost", subsets: ["latin"], weight: ["200", "300", "400"], display: "swap" });
const malayalam = Noto_Sans_Malayalam({ variable: "--font-malayalam", subsets: ["malayalam"], weight: ["400", "600"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "InSync.", template: "%s · InSync." },
  description: "Everything in sync. Attendance and phone custody for residential colleges — QR or typed code, confirmed by staff.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "InSync", statusBarStyle: "default" },
  icons: { icon: [{ url: "/brand/mark.svg", type: "image/svg+xml" }, { url: "/brand-icon/192", sizes: "192x192", type: "image/png" }], apple: "/brand-icon/apple" },
};

export const viewport: Viewport = {
  themeColor: "#0b1b36",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${malayalam.variable} ${jost.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
