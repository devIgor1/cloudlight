// SVG paths preserved from the original landing page.
const icons = {
  film: (
    <>
      <rect height="18" rx="2" width="18" x="3" y="3"></rect>{" "}
      <path d="M7 3v18"></path> <path d="M3 7.5h4"></path>{" "}
      <path d="M3 12h18"></path> <path d="M3 16.5h4"></path>{" "}
      <path d="M17 3v18"></path> <path d="M17 7.5h4"></path>{" "}
      <path d="M17 16.5h4"></path>
    </>
  ),
  video: (
    <>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"></path>{" "}
      <rect height="12" rx="2" width="14" x="2" y="6"></rect>
    </>
  ),
  clapperboard: (
    <>
      <path d="m12.296 3.464 3.02 3.956"></path>{" "}
      <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"></path>{" "}
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>{" "}
      <path d="m6.18 5.276 3.1 3.899"></path>
    </>
  ),
  camera: (
    <>
      <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"></path>{" "}
      <circle cx="12" cy="13" r="3"></circle>
    </>
  ),
  image: (
    <>
      <rect height="18" rx="2" ry="2" width="18" x="3" y="3"></rect>{" "}
      <circle cx="9" cy="9" r="2"></circle>{" "}
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
    </>
  ),
  layers: (
    <>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path>{" "}
      <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path>{" "}
      <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path>
    </>
  ),
  "pen-tool": (
    <>
      <path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"></path>{" "}
      <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"></path>{" "}
      <path d="m2.3 2.3 7.286 7.286"></path>{" "}
      <circle cx="11" cy="11" r="2"></circle>
    </>
  ),
  shapes: (
    <>
      <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"></path>{" "}
      <rect height="7" rx="1" width="7" x="3" y="14"></rect>{" "}
      <circle cx="17.5" cy="17.5" r="3.5"></circle>
    </>
  ),
  "file-text": (
    <>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path>{" "}
      <path d="M14 2v5a1 1 0 0 0 1 1h5"></path> <path d="M10 9H8"></path>{" "}
      <path d="M16 13H8"></path> <path d="M16 17H8"></path>
    </>
  ),
  "file-archive": (
    <>
      <path d="M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5"></path>{" "}
      <path d="M14 2v5a1 1 0 0 0 1 1h5"></path> <path d="M8 12v-1"></path>{" "}
      <path d="M8 18v-2"></path> <path d="M8 7V6"></path>{" "}
      <circle cx="8" cy="20" r="2"></circle>
    </>
  ),
  waves: (
    <>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>{" "}
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>{" "}
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13"></path> <circle cx="6" cy="18" r="3"></circle>{" "}
      <circle cx="18" cy="16" r="3"></circle>
    </>
  ),
  box: (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>{" "}
      <path d="m3.3 7 8.7 5 8.7-5"></path> <path d="M12 22V12"></path>
    </>
  ),
  type: (
    <>
      <path d="M12 4v16"></path>{" "}
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"></path>{" "}
      <path d="M9 20h6"></path>
    </>
  ),
  table: (
    <>
      <path d="M12 3v18"></path>{" "}
      <rect height="18" rx="2" width="18" x="3" y="3"></rect>{" "}
      <path d="M3 9h18"></path> <path d="M3 15h18"></path>
    </>
  ),
  braces: (
    <>
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"></path>{" "}
      <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"></path>
    </>
  ),
} as const;

export function FormatIcon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  );
}
