import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arbitrage Console',
  description: 'Live sports arbitrage scanner — SportyBet, Betika, Helabet',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 font-sans text-zinc-100">{children}</body>
    </html>
  );
}
