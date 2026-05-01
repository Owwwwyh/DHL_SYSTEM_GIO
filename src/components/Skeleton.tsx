export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 animate-pulse">
      <div className="flex gap-2 mb-3">
        <div className="w-5 h-5 bg-gray-200 rounded" />
        <div className="w-16 h-5 bg-gray-200 rounded-full" />
        <div className="w-20 h-5 bg-gray-200 rounded-full" />
        <div className="ml-auto w-16 h-4 bg-gray-200 rounded" />
      </div>
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-full mb-1" />
      <div className="h-4 bg-gray-200 rounded w-5/6 mb-3" />
      <div className="flex gap-1">
        <div className="w-12 h-5 bg-gray-100 rounded-full" />
        <div className="w-16 h-5 bg-gray-100 rounded-full" />
        <div className="w-10 h-5 bg-gray-100 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse flex gap-4">
      <div className="flex-1 space-y-2">
        <div className="flex gap-2 mb-1">
          <div className="w-5 h-5 bg-gray-200 rounded" />
          <div className="w-16 h-5 bg-gray-200 rounded-full" />
          <div className="w-24 h-4 bg-gray-200 rounded" />
        </div>
        <div className="h-5 bg-gray-200 rounded w-2/3" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
          <div className="h-3 bg-gray-200 rounded w-1/4 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-4 bg-gray-200 rounded w-4/5" />
        </div>
      </div>
      <div className="flex flex-col gap-2 shrink-0 min-w-[130px]">
        <div className="w-full h-9 bg-gray-200 rounded-lg" />
        <div className="w-full h-9 bg-gray-200 rounded-lg" />
        <div className="w-full h-8 bg-gray-100 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="bg-white rounded-xl p-5 border-l-4 border-gray-200 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-2">
        <div className="h-4 bg-gray-200 rounded w-24" />
        <div className="w-6 h-6 bg-gray-200 rounded" />
      </div>
      <div className="h-8 bg-gray-200 rounded w-16 mt-1" />
    </div>
  );
}
