import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast/ToastProvider";
import "./globals.css";

/**
 * Interface text.
 *
 * A grotesque from the industrial printing tradition: the typefaces of forms,
 * labels, catalogues and work orders, which is the paperwork a garment workshop
 * actually runs on. Inter is a software-interface face — correct anywhere, and
 * therefore characteristic of nothing.
 *
 * `wdth` is not decoration and it is the reason this family was chosen: dense
 * metadata rows can be set NARROWER instead of SMALLER, which is what a care
 * label sewn inside a garment does. Inter has no width axis at all, so the only
 * way to fit more was to shrink the type.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
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

/**
 * `themeColor` paints the browser chrome on mobile so the address bar continues
 * the page instead of framing it. It must match what actually touches the top
 * edge of the viewport, which is the sticky bar: --color-surface-raised.
 *
 * THE ONE HEX OUTSIDE globals.css, and it cannot be otherwise: this becomes a
 * <meta> tag rendered on the server, where no CSS variable exists to read. If
 * the surface token ever changes, this changes with it.
 */
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
