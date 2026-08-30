// Pictogrammes des appels audio et video, dans le meme style que les autres
// icones du projet : trace « currentColor », epaisseur 1.8.
const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  xmlns: 'http://www.w3.org/2000/svg',
})

export const PhoneIcon = ({ size = '20px' }) => (
  <svg {...base(size)}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2Z" />
  </svg>
)

export const PhoneOffIcon = ({ size = '20px' }) => (
  <svg {...base(size)}>
    <path d="M10.7 13.3a16 16 0 0 0 3 2.2l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-3.6-3" />
    <path d="M5.2 9.4A19.6 19.6 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8.1 9.9" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

export const VideoIcon = ({ size = '20px' }) => (
  <svg {...base(size)}>
    <path d="m22 8-6 4 6 4V8Z" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </svg>
)

export const VideoOffIcon = ({ size = '20px' }) => (
  <svg {...base(size)}>
    <path d="M16 16v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
    <path d="M22 8l-6 4 6 4V8Z" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

export const MicIcon = ({ size = '20px' }) => (
  <svg {...base(size)}>
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    <line x1="12" y1="18" x2="12" y2="22" />
  </svg>
)

export const MicOffIcon = ({ size = '20px' }) => (
  <svg {...base(size)}>
    <path d="M15 9.3V5a3 3 0 0 0-5.9-.7" />
    <path d="M9 9v4a3 3 0 0 0 5.1 2.1" />
    <path d="M19 10v1a7 7 0 0 1-10.8 5.9M5 10v1a7 7 0 0 0 1.4 4.2" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

export const ScreenShareIcon = ({ size = '20px' }) => (
  <svg {...base(size)}>
    <rect x="2" y="3" width="20" height="13" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <path d="m12 6 3 3h-2v3h-2V9H9l3-3Z" />
  </svg>
)

export default PhoneIcon
