import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});


export const viewport: Viewport = {
  themeColor: '#2563EB',
}

export const metadata: Metadata = {
  title: "Ajil Plastik POS",
  description: "Sistem Point of Sales Ajil Plastik",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ajil Plastik",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${inter.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
