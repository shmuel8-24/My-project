'use client';

import { type CSSProperties } from 'react';

interface SkeletonProps {
  className?: string;
  style?:     CSSProperties;
}

/**
 * Shimmer skeleton — drop-in replacement for any loading spinner.
 * Pass className to control size/shape (e.g. "w-40 h-40 rounded-3xl").
 */
export default function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden bg-[#E8F0EB] ${className}`}
      style={style}
    >
      <div
        className="absolute inset-0 pointer-events-none -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent"
      />
    </div>
  );
}
