import React from 'react';

interface VercelBadgeProps {
  className?: string;
  style?: React.CSSProperties;
}

export const VercelBadge: React.FC<VercelBadgeProps> = ({
  className = 'h-7 w-auto',
  style,
}) => {
  return (
    <a
      href="https://vercel.com?utm_source=team-axiogen&utm_campaign=oss"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center transition-opacity duration-200 hover:opacity-80 active:scale-[0.98] focus:outline-none"
      title="Powered by Vercel"
      aria-label="Powered by Vercel"
    >
      <img
        src="/powered-by-vercel.svg"
        alt="Powered by Vercel"
        className={className}
        style={{
          display: 'block',
          height: '28px',
          width: 'auto',
          ...style,
        }}
        width={212}
        height={44}
      />
    </a>
  );
};

export default VercelBadge;
