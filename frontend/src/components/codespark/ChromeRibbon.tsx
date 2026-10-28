import React from 'react';

interface ChromeRibbonProps {
  className?: string;
  scrollY?: number;
}

/**
 * Pure Code Procedural 3D Liquid Chrome Mercury Ribbon
 * Generates layered fluid metallic Bézier curves with specular highlights,
 * deep chrome shadows, and crimson reflection rims matching the user's artwork.
 */
export const ChromeRibbon: React.FC<ChromeRibbonProps> = ({ className = '', scrollY = 0 }) => {
  const parallaxOffset = (scrollY * 0.12) % 60;

  return (
    <div
      className={`pointer-events-none select-none overflow-visible ${className}`}
      style={{
        transform: `translateY(${parallaxOffset}px)`,
        transition: 'transform 0.1s ease-out'
      }}
    >
      <svg
        viewBox="0 0 1000 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-2xl"
      >
        <defs>
          {/* Main Metallic Chrome Gradient with High Contrast Highlights */}
          <linearGradient id="chrome-main" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0a0a0c" />
            <stop offset="12%" stopColor="#4a4a50" />
            <stop offset="24%" stopColor="#f4f4f6" />
            <stop offset="35%" stopColor="#1a1a1e" />
            <stop offset="48%" stopColor="#e2e2e8" />
            <stop offset="58%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#2c2d33" />
            <stop offset="82%" stopColor="#9a9aa2" />
            <stop offset="92%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#08080a" />
          </linearGradient>

          {/* Secondary Liquid Chrome Body with Swiss Red Rim Tint */}
          <linearGradient id="chrome-fluid-red" x1="10%" y1="100%" x2="90%" y2="0%">
            <stop offset="0%" stopColor="#050507" />
            <stop offset="18%" stopColor="#3f3f46" />
            <stop offset="32%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#18181b" />
            <stop offset="60%" stopColor="#e52421" stopOpacity="0.85" />
            <stop offset="72%" stopColor="#ffffff" />
            <stop offset="85%" stopColor="#52525b" />
            <stop offset="100%" stopColor="#09090b" />
          </linearGradient>

          {/* Ultra-bright specular highlight edge */}
          <linearGradient id="chrome-specular" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Deep Core Cavity Shadow */}
          <linearGradient id="chrome-cavity" x1="30%" y1="0%" x2="70%" y2="100%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#18181b" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#050507" stopOpacity="0.98" />
          </linearGradient>

          {/* Filter for smooth metallic softness */}
          <filter id="chrome-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="16" stdDeviation="24" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        <g filter="url(#chrome-glow)">
          {/* Main Background Ribbon Sweep (Heavy Lower Toroid Curve) */}
          <path
            d="M 1050,420
               C 850,560 620,680 440,730
               C 310,770 180,780 90,750
               C 30,730 0,690 10,650
               C 25,600 95,570 200,560
               C 360,540 550,500 700,430
               C 840,360 950,250 990,140
               C 1010,80 1000,20 960,0
               C 990,20 1020,90 1010,180
               C 990,300 890,440 1050,420 Z"
            fill="url(#chrome-main)"
          />

          {/* Deep Cavity Void Inside Loop */}
          <path
            d="M 360,630
               C 460,590 560,530 630,460
               C 560,490 480,530 380,570
               C 270,610 210,640 220,660
               C 230,680 290,660 360,630 Z"
            fill="url(#chrome-cavity)"
          />

          {/* Foreground Dynamic Chrome Wave Ribbon */}
          <path
            d="M 1020,120
               C 960,240 820,380 660,470
               C 510,560 360,620 230,640
               C 150,650 90,640 110,610
               C 135,580 220,550 340,510
               C 490,460 660,390 800,290
               C 910,210 970,120 980,60
               C 1000,75 1015,95 1020,120 Z"
            fill="url(#chrome-fluid-red)"
          />

          {/* Crest Specular Sheen (Mirror Light Edge) */}
          <path
            d="M 980,100
               C 920,210 790,340 640,430
               C 500,515 360,570 250,590
               C 210,595 190,590 200,580
               C 215,570 280,545 380,510
               C 510,460 670,395 810,300
               C 910,230 965,150 980,100 Z"
            fill="url(#chrome-specular)"
            opacity="0.9"
          />

          {/* Secondary Organic Ribbon Fold (Top Right Tendril) */}
          <path
            d="M 750,-20
               C 800,50 880,120 940,160
               C 980,190 1010,200 1010,180
               C 1010,150 960,100 900,40
               C 860,-5 810,-35 750,-20 Z"
            fill="url(#chrome-main)"
          />

          {/* Thin Crimson Rim Highlight Line */}
          <path
            d="M 1005,170
               C 940,300 790,450 620,535
               C 470,610 320,660 210,670
               C 160,675 130,665 140,650"
            stroke="#e52421"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />

          {/* Chrome Specular Center Core Bead */}
          <ellipse
            cx="480"
            cy="520"
            rx="60"
            ry="18"
            transform="rotate(-26 480 520)"
            fill="#ffffff"
            opacity="0.35"
          />
        </g>
      </svg>
    </div>
  );
};
