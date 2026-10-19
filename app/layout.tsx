import type { Metadata } from 'next';
import { Bebas_Neue, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const display = Bebas_Neue({ subsets: ['latin'], display: 'swap', variable: '--font-display-source', weight: '400' });
const body = IBM_Plex_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-body-source', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'SCCNH 2027 Volunteer Signup · UF Hillel',
  description: 'SCCNH at the University of Florida. Bagel Day: January 28, 2027. Pre-packaging: January 27.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${display.variable} ${body.variable}`}><body>{children}</body></html>;
}
