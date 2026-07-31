import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function baseProps({ size = 16, className, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    className: cn("shrink-0", className),
    "aria-hidden": true as const,
    ...props,
  };
}

/** Soft YouTube mark: rounded screen + play triangle. */
export function YouTubeIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect
        x="2.5"
        y="5.5"
        width="19"
        height="13"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path
        d="M10.2 9.1v5.8L15.6 12 10.2 9.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Soft TikTok mark: note with subtle dual offset for brand feel. */
export function TikTokIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path
        d="M14.2 3.5c.35 2.35 1.85 3.95 4.1 4.35v2.45c-1.45-.1-2.7-.55-3.75-1.3v5.55c0 3.05-2.35 5.35-5.55 5.35S3.5 17.6 3.5 14.55c0-2.95 2.2-5.2 5.2-5.45v2.55c-1.35.2-2.35 1.3-2.35 2.85 0 1.7 1.3 3 3.05 3s3.05-1.3 3.05-3V3.5h1.75Z"
        fill="currentColor"
        fillOpacity="0.22"
      />
      <path
        d="M13.55 3.5c.35 2.35 1.85 3.95 4.1 4.35v2.45c-1.45-.1-2.7-.55-3.75-1.3v5.55c0 3.05-2.35 5.35-5.55 5.35S2.85 17.6 2.85 14.55c0-2.95 2.2-5.2 5.2-5.45v2.55c-1.35.2-2.35 1.3-2.35 2.85 0 1.7 1.3 3 3.05 3s3.05-1.3 3.05-3V3.5h1.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Soft Instagram mark: rounded camera with lens and flash. */
export function InstagramIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect
        x="3.25"
        y="3.25"
        width="17.5"
        height="17.5"
        rx="5.25"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <circle
        cx="12"
        cy="12"
        r="4.15"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle
        cx="17.15"
        cy="6.95"
        r="1.15"
        fill="currentColor"
      />
    </svg>
  );
}

export function PlatformIcon({
  platform,
  size = 16,
  className,
}: {
  platform: string;
  size?: number;
  className?: string;
}) {
  if (platform === "youtube") return <YouTubeIcon size={size} className={className} />;
  if (platform === "tiktok") return <TikTokIcon size={size} className={className} />;
  if (platform === "instagram") return <InstagramIcon size={size} className={className} />;
  return null;
}
