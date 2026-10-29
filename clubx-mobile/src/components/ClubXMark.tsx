import { useId } from "react";
import Svg, { ClipPath, Circle, Defs, Ellipse, G, Path } from "react-native-svg";

// The ClubX logo mark: the brand mascot's head on a white disc. Same drawing as
// the website's ClubXMascotMark (saasssss-club-updated/components/brand), ported
// to react-native-svg. Fixed colors (white + near-black) on purpose: it is the
// ClubX identity, so it must not change with a club's theme.
const INK = "#09090b";
const SKIN = "#ffffff";
const SHADE = "#d4d4d8";

export default function ClubXMark({ size = 40 }: { size?: number }) {
  const clipId = `cxm-${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="ClubX" accessibilityRole="image">
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx="50" cy="50" r="47" />
        </ClipPath>
      </Defs>
      <Circle cx="50" cy="50" r="47" fill="#fff" />
      <G clipPath={`url(#${clipId})`}>
        <G transform="translate(50 52) scale(0.8) translate(-100 -50)">
          {/* ears */}
          <Circle cx="62" cy="58" r="8" fill={SKIN} stroke={INK} strokeWidth="4" />
          <Circle cx="138" cy="58" r="8" fill={SKIN} stroke={INK} strokeWidth="4" />
          {/* face */}
          <Path
            d="M64 46 Q64 18 100 18 Q136 18 136 46 L136 64 Q136 92 100 96 Q64 92 64 64 Z"
            fill={SKIN}
            stroke={INK}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          {/* hair + curls */}
          <Path d="M64 44 Q66 16 100 14 Q134 16 136 44 Q120 30 100 32 Q80 30 64 44 Z" fill={INK} />
          <Circle cx="83" cy="17" r="7" fill={INK} />
          <Circle cx="100" cy="11" r="7.5" fill={INK} />
          <Circle cx="117" cy="17" r="7" fill={INK} />
          {/* headband */}
          <Path d="M63 40 Q100 30 137 40 L137 51 Q100 41 63 51 Z" fill={SKIN} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
          <Path d="M137 43 L152 38 L150 48 Z M137 47 L151 54 L142 57 Z" fill={SKIN} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <Path d="M96 38 L104 44 M104 38 L96 44" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          {/* eyes */}
          <Ellipse cx="84" cy="67" rx="10.5" ry="11" fill="#fff" stroke={INK} strokeWidth="3.5" />
          <Ellipse cx="116" cy="67" rx="10.5" ry="11" fill="#fff" stroke={INK} strokeWidth="3.5" />
          <Circle cx="84" cy="68" r="5" fill={INK} />
          <Circle cx="116" cy="68" r="5" fill={INK} />
          <Circle cx="86" cy="65.5" r="1.7" fill="#fff" />
          <Circle cx="118" cy="65.5" r="1.7" fill="#fff" />
          {/* brows, nose */}
          <Path d="M72 56 L94 59" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
          <Path d="M128 56 L106 59" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
          <Path d="M100 68 Q96 77 102 79" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {/* grin */}
          <Path d="M80 83 Q100 105 120 83 Q100 89 80 83 Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <Path d="M85 85 Q100 90 115 85 L112 89 Q100 94 88 89 Z" fill="#fff" />
          <Path d="M72 80 Q70 86 76 90 M128 80 Q130 86 124 90" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M96 92 Q100 94 104 92" fill="none" stroke={SHADE} strokeWidth="2.5" strokeLinecap="round" />
        </G>
      </G>
      <Circle cx="50" cy="50" r="47" fill="none" stroke={INK} strokeWidth="4" />
    </Svg>
  );
}
