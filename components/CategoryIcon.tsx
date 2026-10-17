const PATHS: Record<string, string> = {
  textbooks: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13v2H6M9 7h6",
  dorm: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm-1 7h14M8 6v2M8 13v4",
  lab: "M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7 15h10",
  tickets: "M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3v2Zm11-2v12",
  tutoring: "M2 9l10-5 10 5-10 5L2 9Zm4 2v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6",
  rides: "M5 16h14M6 16l1.5-6A2 2 0 0 1 9.4 8.5h5.2a2 2 0 0 1 1.9 1.5L18 16v3h-2v-3M6 16v3h2v-3M8 13h.01M16 13h.01",
  housing: "M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6",
  vehicles: "M3 15v-3l2.5-5h9L18 12h2a1 1 0 0 1 1 1v2M3 15h18M6.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 12h13",
  other: "M3 12V4h8l10 10-8 8L3 12Zm5-4h.01",
};

export function CategoryIcon({ category, className, color = "currentColor" }: { category: string; className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[category] ?? PATHS.other} />
    </svg>
  );
}
