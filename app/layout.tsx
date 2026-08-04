import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no build-time Google Fonts dependency).
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/400-italic.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import Providers from "./providers";
import TabBar from "@/components/TabBar";

export const metadata: Metadata = {
  title: "Level Set",
  description:
    "Executive decision surface — what has happened since you last looked, and what needs you.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "Level Set",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F6F4EE",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <Providers>
          <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
            <main className="flex flex-1 flex-col px-[18px] pt-[14px] pb-[8px]">
              {children}
            </main>
            <TabBar />
          </div>
        </Providers>
      </body>
    </html>
  );
}
