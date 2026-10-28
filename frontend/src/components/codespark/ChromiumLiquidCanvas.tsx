import React, { useEffect, useRef } from 'react';

interface ChromiumLiquidCanvasProps {
  className?: string;
  scrollY?: number;
  variant?: 'hero' | 'phases' | 'ambient';
}

/**
 * ChromiumLiquidCanvas
 * Renders procedural, high-fidelity liquid chrome mercury shapes directly in Chromium.
 * Features organic fluid curves, multi-band metallic gradients, specular mirror sheen,
 * and crimson reflection bounce matching the user's reference posters.
 */
export const ChromiumLiquidCanvas: React.FC<ChromiumLiquidCanvasProps> = ({
  className = '',
  scrollY = 0,
  variant = 'hero'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll-linked dynamic fluid transformations
  const heroParallax = scrollY * 0.15;
  const rotationAngle = (scrollY * 0.04) % 12;

  if (variant === 'phases') {
    return (
      <div
        ref={containerRef}
        className={`pointer-events-none select-none ${className}`}
        style={{
          transform: `translate3d(0, ${scrollY * 0.08}px, 0)`,
          willChange: 'transform'
        }}
      >
        <svg
          viewBox="0 0 1000 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_25px_35px_rgba(0,0,0,0.35)]"
        >
          <defs>
            {/* Liquid Chrome Primary Mirror Sheen */}
            <linearGradient id="phases-chrome-base" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#08080a" />
              <stop offset="10%" stopColor="#38383e" />
              <stop offset="22%" stopColor="#f5f5f7" />
              <stop offset="30%" stopColor="#1c1c20" />
              <stop offset="42%" stopColor="#dcdce2" />
              <stop offset="52%" stopColor="#ffffff" />
              <stop offset="64%" stopColor="#222328" />
              <stop offset="78%" stopColor="#e52421" stopOpacity="0.85" />
              <stop offset="88%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#08080a" />
            </linearGradient>

            {/* Specular White Crest */}
            <linearGradient id="phases-crest" x1="0%" y1="30%" x2="100%" y2="70%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="70%" stopColor="#ffffff" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            {/* Core Cavity Shadow */}
            <linearGradient id="phases-shadow" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#18181b" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#050507" stopOpacity="0.98" />
            </linearGradient>
          </defs>

          {/* Liquid Mercury Crest Wave sweeping from bottom right through Phase 2 */}
          <g>
            {/* Deep Underbody */}
            <path
              d="M 1050,450
                 C 860,540 680,590 520,570
                 C 380,550 280,480 230,410
                 C 190,350 210,290 270,270
                 C 350,240 470,280 580,330
                 C 720,390 880,420 1020,380
                 C 1050,370 1060,420 1050,450 Z"
              fill="url(#phases-chrome-base)"
            />

            {/* Inward Cavity Void */}
            <path
              d="M 450,480
                 C 580,460 700,410 790,350
                 C 700,380 590,410 480,430
                 C 370,450 310,470 330,490
                 C 350,510 400,490 450,480 Z"
              fill="url(#phases-shadow)"
            />

            {/* Foreground Liquid Ribbon Lip */}
            <path
              d="M 1030,280
                 C 920,340 760,410 610,440
                 C 470,470 350,470 270,430
                 C 210,400 190,350 220,320
                 C 250,290 330,280 430,300
                 C 560,330 720,380 870,360
                 C 960,350 1010,310 1030,280 Z"
              fill="url(#phases-chrome-base)"
            />

            {/* Specular Glint Highlight */}
            <path
              d="M 1000,290
                 C 890,345 740,410 590,435
                 C 460,460 360,455 290,425
                 C 240,400 230,370 250,345
                 C 280,325 350,315 440,330
                 C 560,355 710,395 850,380
                 C 930,370 980,330 1000,290 Z"
              fill="url(#phases-crest)"
              opacity="0.9"
            />

            {/* Crimson Bounce Highlight Line */}
            <path
              d="M 1010,310
                 C 910,380 770,445 620,465
                 C 480,485 360,480 280,450
                 C 230,430 200,395 210,365"
              stroke="#e52421"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              opacity="0.9"
            />
          </g>
        </svg>
      </div>
    );
  }

  // Default: Monumental Liquid Chrome Ribbon matching Image 1
  return (
    <div
      ref={containerRef}
      className={`pointer-events-none select-none ${className}`}
      style={{
        transform: `translate3d(0, ${heroParallax}px, 0) rotate(${rotationAngle}deg)`,
        willChange: 'transform'
      }}
    >
      <svg
        viewBox="0 0 1000 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_35px_50px_rgba(0,0,0,0.4)]"
      >
        <defs>
          {/* Main Metallic Chrome Gradient with Multi-band Specular Sheen */}
          <linearGradient id="liquid-chrome-main" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#08080a" />
            <stop offset="14%" stopColor="#48484f" />
            <stop offset="25%" stopColor="#ffffff" />
            <stop offset="36%" stopColor="#18181c" />
            <stop offset="47%" stopColor="#e4e4eb" />
            <stop offset="56%" stopColor="#ffffff" />
            <stop offset="68%" stopColor="#24252a" />
            <stop offset="80%" stopColor="#9a9aa4" />
            <stop offset="90%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#060608" />
          </linearGradient>

          {/* Liquid Mercury with Crimson Reflection Tint */}
          <linearGradient id="liquid-chrome-crimson" x1="10%" y1="100%" x2="90%" y2="0%">
            <stop offset="0%" stopColor="#050507" />
            <stop offset="16%" stopColor="#3b3b42" />
            <stop offset="28%" stopColor="#ffffff" />
            <stop offset="42%" stopColor="#151518" />
            <stop offset="58%" stopColor="#e52421" stopOpacity="0.88" />
            <stop offset="70%" stopColor="#ffffff" />
            <stop offset="84%" stopColor="#4a4a52" />
            <stop offset="100%" stopColor="#08080a" />
          </linearGradient>

          {/* High-Gloss Mirror Highlight */}
          <linearGradient id="liquid-specular" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="72%" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Inward Cavity Void Shadow */}
          <linearGradient id="liquid-cavity" x1="25%" y1="0%" x2="75%" y2="100%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.96" />
            <stop offset="50%" stopColor="#141416" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#030305" stopOpacity="0.99" />
          </linearGradient>
        </defs>

        <g>
          {/* Main Heavy Lower Liquid Toroid Sweep */}
          <path
            d="M 1040,400
               C 850,550 630,680 440,730
               C 310,770 180,780 90,750
               C 30,730 0,690 10,650
               C 25,600 95,570 200,560
               C 360,540 550,500 700,430
               C 840,360 950,250 990,140
               C 1010,80 1000,20 960,0
               C 990,20 1020,90 1010,180
               C 990,300 890,440 1040,400 Z"
            fill="url(#liquid-chrome-main)"
          />

          {/* Toroid Inner Cavity Shadow */}
          <path
            d="M 360,630
               C 460,590 560,530 630,460
               C 560,490 480,530 380,570
               C 270,610 210,640 220,660
               C 230,680 290,660 360,630 Z"
            fill="url(#liquid-cavity)"
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
            fill="url(#liquid-chrome-crimson)"
          />

          {/* Mirror Specular Sheen (Mirror Light Edge) */}
          <path
            d="M 980,100
               C 920,210 790,340 640,430
               C 500,515 360,570 250,590
               C 210,595 190,590 200,580
               C 215,570 280,545 380,510
               C 510,460 670,395 810,300
               C 910,230 965,150 980,100 Z"
            fill="url(#liquid-specular)"
            opacity="0.92"
          />

          {/* Top Right Floating Liquid Mercury Droplet & Curl */}
          <path
            d="M 750,-20
               C 800,50 880,120 940,160
               C 980,190 1010,200 1010,180
               C 1010,150 960,100 900,40
               C 860,-5 810,-35 750,-20 Z"
            fill="url(#liquid-chrome-main)"
          />

          {/* Razor-Sharp Swiss Crimson Rim Reflection */}
          <path
            d="M 1005,170
               C 940,300 790,450 620,535
               C 470,610 320,660 210,670
               C 160,675 130,665 140,650"
            stroke="#e52421"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />
        </g>
      </svg>
    </div>
  );
};
