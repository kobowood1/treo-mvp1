export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-sm w-full">
        <p className="text-5xl mb-4" aria-hidden="true">🔍</p>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Page not found</h1>
        <p className="text-slate-500 text-sm mb-6">
          That page doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <a
          href="/"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors"
        >
          Go Home
        </a>
      </div>
    </main>
  );
}
