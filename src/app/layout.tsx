import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TR Dhal Site Ops",
  description: "Construction order & inventory management for TR Dhal Group of Companies",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
