import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zetsu - File Archive | Download Center',
  description: 'Zetsu File Archive - APKs, tools, and selected Zetsu releases.',
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
