import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
})

export const Logo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ width: 22, height: 22, ...p })} strokeWidth={0}>
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8b7bff" /><stop offset="1" stopColor="#38e1c6" />
      </linearGradient>
    </defs>
    <path d="M12 2 22 7 12 12 2 7z" fill="url(#lg)" />
    <path d="M2 12l10 5 10-5" stroke="url(#lg)" strokeWidth={1.8} fill="none" opacity={0.8} />
    <path d="M2 17l10 5 10-5" stroke="url(#lg)" strokeWidth={1.8} fill="none" opacity={0.5} />
  </svg>
)
export const ArrowRight = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
export const Github = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" /></svg>
export const Grid = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
export const Circles = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="3" /><circle cx="15" cy="14" r="2.5" /></svg>
export const Graph = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="5" cy="6" r="2.2" /><circle cx="19" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M7 7l4 9M17 7l-4 9M7.2 6h9.6" /></svg>
export const Layers = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3 21 8 12 13 3 8z" /><path d="M3 13l9 5 9-5" /></svg>
export const Route = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5" /></svg>
export const Search = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
export const Sparkle = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>
export const File = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
export const Folder = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
export const X = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
export const Star = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
export const Fork = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5" /></svg>
export const Home = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 11 12 4l9 7M5 10v10h14V10" /></svg>
export const ArrowIn = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
export const ArrowOut = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
export const Play = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M7 5v14l11-7z" /></svg>
export const Package = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg>
