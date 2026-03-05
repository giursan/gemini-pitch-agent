import type { Metadata } from "next";
import { Outfit, Inter, JetBrains_Mono } from "next/font/google";
import Sidebar from "../components/Sidebar";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aura | AI Presentation Mentor",
  description: "Master your pitch with real-time multi-agent feedback and TED benchmarks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${outfit.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased h-screen w-screen overflow-hidden flex bg-background`}
      >
        <Sidebar />
        <main className="flex-1 h-full overflow-y-auto relative bg-neutral-50">
          {children}
        </main>
      </body>
    </html>
  );
}
