import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 p-4 text-center">
      <h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
      <p className="text-slate-600 mb-4">Could not find requested resource</p>
      <Link href="/" className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800">
        Return Home
      </Link>
    </div>
  );
}
