'use client';

import { motion } from 'framer-motion';
import { StudySpaceIcon } from './StudySpaceIcon';

type Props = {
  onClick?: () => void;
  label?: string;
  sublabel?: string;
  /** Icon size in px — button scales with it (default 160) */
  size?: number;
  className?: string;
};

export function StudySpaceButton({
  onClick,
  label,
  sublabel,
  size = 160,
  className = '',
}: Props) {
  const radius = Math.round(size * 0.11);

  return (
    <motion.button
      onClick={onClick}
      className={`flex flex-col items-center gap-3 group ${className}`}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
    >
      {/* Icon shell with hover glow */}
      <motion.div
        style={{ borderRadius: radius, overflow: 'hidden', lineHeight: 0 }}
        whileHover={{
          boxShadow:
            '0 20px 52px rgba(30,80,18,0.20), 0 6px 20px rgba(30,80,18,0.12)',
        }}
        initial={{
          boxShadow:
            '0 4px 18px rgba(30,80,18,0.12), 0 1px 5px rgba(30,80,18,0.06)',
        }}
        transition={{ duration: 0.25 }}
      >
        <StudySpaceIcon size={size} />
      </motion.div>

      {/* Optional label */}
      {label && (
        <div className="text-center select-none">
          <p
            className="font-bold text-sm text-[#1C3329] group-hover:text-[#517B3E] transition-colors duration-200"
            style={{ letterSpacing: '-0.01em' }}
          >
            {label}
          </p>
          {sublabel && (
            <p className="text-xs text-[#527061] mt-0.5">{sublabel}</p>
          )}
        </div>
      )}
    </motion.button>
  );
}
