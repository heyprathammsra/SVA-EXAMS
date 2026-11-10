'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 p-4 text-center">
        <h2 className="text-2xl font-bold mb-2">Something went wrong!</h2>
        <p className="text-slate-600 mb-4">{error.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
