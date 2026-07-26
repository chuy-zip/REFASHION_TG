import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast/ToastProvider";
import "./globals.css";

// Interface text. Neutral, legible at small sizes, good tabular figures.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Technical values only: ids, R2 keys, costs, dimensions, filenames.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Refashion IA",
  description: "Prototipado de uniformes corporativos asistido por IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
