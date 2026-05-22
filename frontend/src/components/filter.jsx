import React from 'react';

export default function Filter({ activeFilter, setFilter }) {
  const options = [
    { id: 'all', label: 'ALL_UNITS' },
    { id: 'image', label: 'PHOTOS' },
    { id: 'gif', label: 'GIFS' }
  ];

  return (
    <div className="flex gap-2 font-mono text-[0.6rem] sm:text-xs overflow-x-auto pb-2 sm:pb-0">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => setFilter(opt.id)}
          className={`px-4 py-2 border transition-all duration-300 uppercase tracking-widest whitespace-nowrap ${
            activeFilter === opt.id
              ? 'bg-[#ff4a1c] border-[#ff4a1c] text-white shadow-[0_0_15px_rgba(255,74,28,0.4)]'
              : 'bg-[#111116] border-[#22222f] text-[#8a8a98] hover:border-[#ff4a1c]/50 hover:text-[#f4f4f5]'
          }`}
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.25rem), calc(100% - 0.25rem) 100%, 0 100%)' }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
