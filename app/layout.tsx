import type { Metadata } from 'next';
import { Fraunces, Karla } from 'next/font/google';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-display-source' });
const body = Karla({ subsets: ['latin'], display: 'swap', variable: '--font-body-source' });

export const metadata: Metadata = {
  title: 'SCCNH 2027 Volunteer Signup · UF Hillel',
  description: 'Choose a location, time, and role for Spread Cream Cheese Not Hate at the University of Florida, January 25–27, 2027.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${display.variable} ${body.variable}`}><body>{children}</body></html>;
}
