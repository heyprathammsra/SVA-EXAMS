import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Saraswati Vidya Academy Management System',
  description: 'Streamlined student data management, grade tracking, and report card generation for teachers.',
  openGraph: {
    title: 'Saraswati Vidya Academy Management System',
    description: 'Streamlined student data management, grade tracking, and report card generation for teachers.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Saraswati Vidya Academy Management System',
    description: 'Streamlined student data management, grade tracking, and report card generation for teachers.',
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
