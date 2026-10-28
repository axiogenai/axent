import React from 'react';

/**
 * 4-Point Swiss Red Star (✦) as featured in the reference artwork
 */
export const SwissRedStar: React.FC<{ size?: number; className?: string }> = ({
  size = 36,
  className = ''
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none ${className}`}
  >
    <path
      d="M20 0 C20 11 20 11 9 20 C20 20 20 20 20 40 C20 29 20 29 31 20 C20 20 20 20 20 0 Z"
      fill="#E52421"
    />
  </svg>
);

/**
 * Technical Barcode with Swiss Red Anchor Tab
 */
export const SwissBarcode: React.FC<{ height?: number; className?: string }> = ({
  height = 24,
  className = ''
}) => (
  <div className={`inline-flex flex-col gap-1 select-none ${className}`}>
    <div className="flex items-center gap-[2.5px]" style={{ height: `${height}px` }}>
      <span className="w-[3px] h-full bg-black" />
      <span className="w-[1.5px] h-full bg-black" />
      <span className="w-[4px] h-full bg-black" />
      <span className="w-[1px] h-full bg-black" />
      <span className="w-[2.5px] h-full bg-black" />
      <span className="w-[1px] h-full bg-black" />
      <span className="w-[5px] h-full bg-black" />
      <span className="w-[2px] h-full bg-black" />
      <span className="w-[1px] h-full bg-black" />
      <span className="w-[3.5px] h-full bg-black" />
      <span className="w-[2px] h-full bg-black" />
      <span className="w-[4px] h-full bg-black" />
      <span className="w-[1.5px] h-full bg-black" />
      <span className="w-[2px] h-full bg-black" />
      <span className="w-[5px] h-full bg-black" />
      <span className="w-[1px] h-full bg-black" />
    </div>
    <div className="h-[3px] w-full bg-[#E52421]" />
  </div>
);

/**
 * Swiss Registration Crosshair (+)
 */
export const Crosshair: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative flex items-center justify-center w-5 h-5 text-zinc-400 select-none ${className}`}>
    <span className="absolute w-3.5 h-[1px] bg-zinc-400" />
    <span className="absolute h-3.5 w-[1px] bg-zinc-400" />
  </div>
);

/**
 * AXENT Wordmark with Signature Red Chevron Accent on 'X'
 */
export const AxentWordmark: React.FC<{ size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }> = ({
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'text-lg tracking-wider',
    md: 'text-2xl sm:text-3xl tracking-tight',
    lg: 'text-4xl sm:text-5xl tracking-tighter',
    xl: 'text-6xl sm:text-7xl md:text-8xl tracking-tightest'
  }[size];

  return (
    <span className={`inline-flex items-center font-black uppercase text-black font-sans leading-none ${sizeClasses} ${className}`}>
      <span>A</span>
      <span className="relative inline-block mx-[1px]">
        <span>X</span>
        {/* Signature Red Chevron Accent crossing the X */}
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[3px] bg-[#E52421] rotate-45 pointer-events-none"
          style={{ mixBlendMode: 'multiply' }}
        />
      </span>
      <span>ENT</span>
    </span>
  );
};
