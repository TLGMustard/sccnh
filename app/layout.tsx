import type { Metadata } from 'next';
import { Bebas_Neue, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const display = Bebas_Neue({ subsets: ['latin'], display: 'swap', variable: '--font-display-source', weight: '400' });
const body = IBM_Plex_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-body-source', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'SCCNH 2027 Volunteer Signup · UF Hillel',
  description: 'SCCNH volunteer signup at the University of Florida, January 25 to 27, 2027.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${display.variable} ${body.variable}`}><body>{children}</body></html>;
}
