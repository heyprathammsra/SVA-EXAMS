import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'School ERP - Student Records & Report Cards',
  description:
    'Comprehensive School ERP for Student Information, Examinations, Excel Marks Entry, Custom Grade Calculation Engine, and Report Card Generation.',
  openGraph: {
    title: 'School ERP - Student Records & Report Cards',
    description:
      'Comprehensive School ERP for Student Information, Examinations, Excel Marks Entry, Custom Grade Calculation Engine, and Report Card Generation.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'School ERP - Student Records & Report Cards',
    description:
      'Comprehensive School ERP for Student Information, Examinations, Excel Marks Entry, Custom Grade Calculation Engine, and Report Card Generation.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-slate-50">
      <body className="h-full font-sans antialiased text-slate-900 bg-[#F8FAFC]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
