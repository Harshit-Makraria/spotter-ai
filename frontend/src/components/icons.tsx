/** Inline stroke icons, sized by the `size` prop and coloured by `currentColor`. */

interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const TruckIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" />
    <circle cx="7" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </svg>
);

export const RouteIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="5.5" r="2.5" />
    <path d="M8 18.5h6a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h6" />
  </svg>
);

export const GaugeIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 14 16 9" />
    <path d="M3.5 18a9 9 0 1 1 17 0" />
    <circle cx="12" cy="14" r="1.4" />
  </svg>
);

export const ClockIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const SheetIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

export const ListIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.3" />
    <circle cx="4.5" cy="12" r="1.3" />
    <circle cx="4.5" cy="18" r="1.3" />
  </svg>
);

export const ShieldIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.4-7.5 9.5-4.4-1.1-7.5-5.1-7.5-9.5V6z" />
    <path d="M9.2 12l2 2 3.6-3.8" />
  </svg>
);

export const MapPinIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
);

export const FlagIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 21V4M5 4h12l-2.2 3.5L17 11H5" />
  </svg>
);

export const CalendarIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const SunIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </svg>
);

export const MoonIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
);

export const LinkIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3" />
    <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3" />
  </svg>
);

export const PrintIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M6.5 9V3.5h11V9M6.5 18H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 10h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 18h-1.5" />
    <rect x="6.5" y="14.5" width="11" height="6" rx="1" />
  </svg>
);

export const CheckIcon = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.6} className={className}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

export const CrossIcon = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.6} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const ChevronIcon = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.2} className={className}>
    <path d="M6 9.5l6 6 6-6" />
  </svg>
);

export const ArrowRightIcon = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);

export const SparkIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5 10.1 12 4.5 10l5.6-1.4z" />
  </svg>
);
