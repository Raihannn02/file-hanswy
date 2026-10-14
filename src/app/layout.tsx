import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'File HansWY - Fast & Secure Cloud Storage',
  description: 'Penyimpanan dan pengelolaan file 24 jam dengan performa tinggi berbasis Vercel.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>{children}</body>
    </html>
  );
}
