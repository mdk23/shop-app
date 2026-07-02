import type { Metadata } from "next";
import { Anton, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SonnerProvider } from "@/components/SonnerProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { RouteGuard } from "@/components/RouteGuard";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
});

const beVietnam = Be_Vietnam_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-be-vietnam",
});

export const metadata: Metadata = {
  title: "Olympia Chicken POS",
  description: "Modern Restaurant POS and Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${anton.variable} ${beVietnam.variable} antialiased`}>
        <ConvexClientProvider>
          <AuthProvider>
            <SonnerProvider />
            <RouteGuard>
              {children}
            </RouteGuard>
          </AuthProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}

