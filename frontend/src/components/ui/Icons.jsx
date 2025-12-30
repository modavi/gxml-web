export function IconReset() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83m-8.48 8.48l-2.83 2.83m0-14.14l2.83 2.83m8.48 8.48l2.83 2.83" />
    </svg>
  )
}

export function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4m0 14v4m-9-9h4m10 0h4m-2.636-6.364l-2.828 2.828m-8.486 8.486l-2.828 2.828m0-14.142l2.828 2.828m8.486 8.486l2.828 2.828" />
    </svg>
  )
}

export function IconTable() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  )
}

// Geometry spreadsheet icons
export function IconPoint() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="3" />
    </svg>
  )
}

export function IconVertex() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3" />
    </svg>
  )
}

export function IconFace() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" opacity="0.7">
      <path d="M3 3h10v10H3z" />
    </svg>
  )
}

export function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function IconChevronUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 15 12 9 18 15" />
    </svg>
  )
}

// GXML logo icon - stylized geometric XML brackets
export function IconGXML() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Left bracket */}
      <path d="M8 4L3 12L8 20" strokeLinecap="round" strokeLinejoin="round" />
      {/* Right bracket */}
      <path d="M16 4L21 12L16 20" strokeLinecap="round" strokeLinejoin="round" />
      {/* Center diamond/geometric shape */}
      <path d="M12 7L15 12L12 17L9 12Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Pencil/draw icon for creation mode
export function IconPencil() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

// Plus icon for adding
export function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

// Undo icon
export function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.7L3 7" />
    </svg>
  )
}
