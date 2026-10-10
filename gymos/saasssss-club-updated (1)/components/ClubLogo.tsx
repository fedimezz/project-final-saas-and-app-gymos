import React, { useState } from "react";
import Image from "next/image";
import { Dumbbell } from "lucide-react";
import { safeImageUrl } from "@/lib/image-url";

type LogoSize = "sm" | "md" | "lg" | "xl";

interface ClubLogoProps {
  logoUrl?: string | null;
  clubName?: string;
  size?: LogoSize;
  className?: string;
}

const sizeClasses: Record<LogoSize, { container: string; text: string; icon: string; imageSize: number }> = {
  sm: { container: "w-8 h-8", text: "text-xs", icon: "w-4 h-4", imageSize: 32 },
  md: { container: "w-10 h-10", text: "text-sm", icon: "w-5 h-5", imageSize: 40 },
  lg: { container: "w-12 h-12", text: "text-base", icon: "w-6 h-6", imageSize: 48 },
  xl: { container: "w-16 h-16", text: "text-xl", icon: "w-8 h-8", imageSize: 64 },
};

export function ClubLogo({ logoUrl, clubName = "Club", size = "md", className = "" }: ClubLogoProps) {
  // Remember WHICH url failed: a replaced logo has a new url and is retried
  // automatically; a deleted/invalid/disallowed one falls back to the initial.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const classes = sizeClasses[size];
  const safeUrl = safeImageUrl(logoUrl);

  const initial = clubName ? clubName.charAt(0).toUpperCase() : "C";

  if (safeUrl && failedUrl !== safeUrl) {
    return (
      <div className={`relative flex-shrink-0 rounded-md overflow-hidden bg-muted/20 ${classes.container} ${className}`}>
        <Image
          src={safeUrl}
          alt={`${clubName} logo`}
          fill
          className="object-contain"
          onError={() => setFailedUrl(safeUrl)}
          sizes={`${classes.imageSize}px`}
        />
      </div>
    );
  }

  // Fallback
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 rounded-md bg-emerald-500 text-slate-950 font-bold shadow-sm ${classes.container} ${className}`}
    >
      {clubName ? (
        <span className={classes.text}>{initial}</span>
      ) : (
        <Dumbbell className={classes.icon} />
      )}
    </div>
  );
}
