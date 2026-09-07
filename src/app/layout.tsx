import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SonnerProvider } from "@/components/SonnerProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { BranchProvider } from "@/contexts/BranchContext";
import { RouteGuard } from "@/components/RouteGuard";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
});

export const metadata: Metadata = {
  title: "Shop App",
  description: "Modern Restaurant POS and Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="sage">
      <body className={`${plusJakartaSans.variable} antialiased`}>
        <ConvexClientProvider>
          <ThemeProvider>
            <BranchProvider>
              <AuthProvider>
                <SonnerProvider />
                <RouteGuard>
                  {children}
                </RouteGuard>
              </AuthProvider>
            </BranchProvider>
          </ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
