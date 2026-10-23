import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';

const poppins = Poppins({ subsets: ['latin'], display: 'swap', variable: '--font-poppins', weight: ['400', '500', '600', '700', '800', '900'] });

export const metadata: Metadata = {
  title: 'SCCNH 2027 Volunteer Signup · UF Hillel',
  description: 'SCCNH at the University of Florida. Bagel Day: January 28, 2027. Pre-packaging: January 27.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={poppins.variable}><body>{children}</body></html>;
}
