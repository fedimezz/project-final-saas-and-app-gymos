// ClubXMascot — the original ClubX brand character: a cheerful, muscular
// cartoon athlete (buzzed hair, headband, white tank top with a bold X, black
// shorts). Drawn from scratch for ClubX; it is not based on any existing
// character.
//
//  - <ClubXMascot />      full figure, used by the landing page follower.
//  - <ClubXMascotMark />  round head-only badge, used as the logo mark.
//
// Colors are fixed (white skin, #09090b ink) so the character looks the same
// in light and dark mode. Motion is pure CSS (see the `cxm-*` rules in
// app/landing-mono.css), driven by data attributes and CSS variables that the
// parent sets on an ancestor with the `cxm` class:
//   --lx / --ly   where the eyes look (-1 … 1)
//   --lean        body lean in degrees
//   data-walking  "true" while the figure is moving
//   data-flex     "true" while it flexes
import { useId } from "react";

const INK = "#09090b";
const SKIN = "#ffffff";
const SHADE = "#d4d4d8";

/** The head, shared by the full figure and the logo mark. */
function Head({ animated }: { animated: boolean }) {
  return (
    <g className={animated ? "cxm-head" : undefined}>
      {/* ears */}
      <circle cx="62" cy="58" r="8" fill={SKIN} stroke={INK} strokeWidth="4" />
      <circle cx="138" cy="58" r="8" fill={SKIN} stroke={INK} strokeWidth="4" />
      {/* face: strong, rounded jaw */}
      <path
        d="M64 46 Q64 18 100 18 Q136 18 136 46 L136 64 Q136 92 100 96 Q64 92 64 64 Z"
        fill={SKIN}
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* buzzed hair + a few curls on top */}
      <path d="M64 44 Q66 16 100 14 Q134 16 136 44 Q120 30 100 32 Q80 30 64 44 Z" fill={INK} />
      <circle cx="83" cy="17" r="7" fill={INK} />
      <circle cx="100" cy="11" r="7.5" fill={INK} />
      <circle cx="117" cy="17" r="7" fill={INK} />
      {/* headband with knot */}
      <path
        d="M63 40 Q100 30 137 40 L137 51 Q100 41 63 51 Z"
        fill={SKIN}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M137 43 L152 38 L150 48 Z M137 47 L151 54 L142 57 Z" fill={SKIN} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M96 38 L104 44 M104 38 L96 44" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      {/* eyes */}
      <g>
        <ellipse cx="84" cy="67" rx="10.5" ry="11" fill="#fff" stroke={INK} strokeWidth="3.5" />
        <ellipse cx="116" cy="67" rx="10.5" ry="11" fill="#fff" stroke={INK} strokeWidth="3.5" />
        <g className={animated ? "cxm-pupils" : undefined}>
          <circle cx="84" cy="68" r="5" fill={INK} />
          <circle cx="116" cy="68" r="5" fill={INK} />
          <circle cx="86" cy="65.5" r="1.7" fill="#fff" />
          <circle cx="118" cy="65.5" r="1.7" fill="#fff" />
        </g>
      </g>
      {/* confident brows */}
      <path d="M72 56 L94 59" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M128 56 L106 59" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
      {/* nose */}
      <path d="M100 68 Q96 77 102 79" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* big grin with teeth */}
      <path d="M80 83 Q100 105 120 83 Q100 89 80 83 Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M85 85 Q100 90 115 85 L112 89 Q100 94 88 89 Z" fill="#fff" />
      {/* cheek + chin lines */}
      <path d="M72 80 Q70 86 76 90 M128 80 Q130 86 124 90" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M96 92 Q100 94 104 92" fill="none" stroke={SHADE} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

/** One arm in the double-biceps pose (drawn for the left side). */
function Arm() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* ink silhouette first, skin on top → one clean merged outline */}
      <g stroke={INK} fill={INK}>
        <path d="M50 114 L24 150" strokeWidth="32" fill="none" />
        <path d="M24 150 L22 106" strokeWidth="26" fill="none" />
        <circle cx="21" cy="96" r="16" />
        <ellipse cx="33" cy="128" rx="17" ry="19" />
      </g>
      <g stroke={SKIN} fill={SKIN}>
        <path d="M50 114 L24 150" strokeWidth="25" fill="none" />
        <path d="M24 150 L22 106" strokeWidth="19" fill="none" />
        <circle cx="21" cy="96" r="12" />
        <ellipse cx="33" cy="128" rx="12.5" ry="14.5" />
      </g>
      {/* muscle definition + fist */}
      <path d="M28 120 Q38 126 32 138" fill="none" stroke={SHADE} strokeWidth="3" />
      <path d="M15 92 L27 92 M15 98 L27 98" stroke={INK} strokeWidth="2.5" fill="none" />
    </g>
  );
}

export function ClubXMascot({ className }: { className?: string }) {
  return (
    <svg
      className={`cxm-svg ${className ?? ""}`}
      viewBox="0 0 200 280"
      role="img"
      aria-label="Mascotte ClubX"
      focusable="false"
    >
      {/* ground shadow */}
      <ellipse cx="100" cy="272" rx="46" ry="5" fill="#000" opacity="0.18" />

      <g className="cxm-body">
        {/* legs (swing while walking) */}
        <g className="cxm-leg-l">
          <path d="M84 188 L80 242" stroke={INK} strokeWidth="30" strokeLinecap="round" fill="none" />
          <path d="M84 188 L80 242" stroke={SKIN} strokeWidth="23" strokeLinecap="round" fill="none" />
          <path d="M60 244 Q58 266 68 269 L98 269 Q100 254 94 244 Z" fill={INK} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M63 263 L97 263" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <g className="cxm-leg-r">
          <path d="M116 188 L120 242" stroke={INK} strokeWidth="30" strokeLinecap="round" fill="none" />
          <path d="M116 188 L120 242" stroke={SKIN} strokeWidth="23" strokeLinecap="round" fill="none" />
          <path d="M140 244 Q142 266 132 269 L102 269 Q100 254 106 244 Z" fill={INK} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M103 263 L137 263" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* shorts */}
        <path
          d="M68 174 L132 174 L137 216 L104 216 L100 198 L96 216 L63 216 Z"
          fill={INK}
          stroke={INK}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M70 180 L66 212 M130 180 L134 212" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />

        {/* torso: V-shaped, wide shoulders — white tank top */}
        <path
          d="M52 106 Q100 90 148 106 L136 132 L126 180 L74 180 L64 132 Z"
          fill="#fff"
          stroke={INK}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* neck + tank neckline */}
        <path d="M88 92 L88 106 Q100 118 112 106 L112 92 Z" fill={SKIN} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        {/* the X */}
        <path d="M84 126 L116 160 M116 126 L84 160" stroke={INK} strokeWidth="10" strokeLinecap="round" />
        {/* abs hint on the waistband */}
        <path d="M100 166 L100 178" stroke={SHADE} strokeWidth="2.5" strokeLinecap="round" />

        {/* shoulders */}
        <circle cx="50" cy="112" r="14" fill={SKIN} stroke={INK} strokeWidth="4" />
        <circle cx="150" cy="112" r="14" fill={SKIN} stroke={INK} strokeWidth="4" />

        {/* arms: left as drawn, right mirrored */}
        <g className="cxm-arm-l">
          <Arm />
        </g>
        <g className="cxm-arm-r">
          <g transform="translate(200 0) scale(-1 1)">
            <Arm />
          </g>
        </g>

        <Head animated />
      </g>
    </svg>
  );
}

/** Round head-only badge: the ClubX logo mark. Static, any size. */
export function ClubXMascotMark({ size = 36, className }: { size?: number; className?: string }) {
  const clipId = `cxm-clip-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="ClubX"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="47" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="47" fill="#fff" />
      <g clipPath={`url(#${clipId})`}>
        <g transform="translate(50 52) scale(0.8) translate(-100 -50)">
          <Head animated={false} />
        </g>
      </g>
      <circle cx="50" cy="50" r="47" fill="none" stroke={INK} strokeWidth="4" />
    </svg>
  );
}

export default ClubXMascot;
