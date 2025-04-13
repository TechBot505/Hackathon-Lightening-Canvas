import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lightening Canvas",
  description: "A lightning fast canvas for your next project",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
