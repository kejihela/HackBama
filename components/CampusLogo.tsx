/** A school's logo on a white badge, or the generic CampusLoop mark when it has none. */
export function CampusLogo({ logo, name, size = 34 }: { logo: string | null; name: string; size?: number }) {
  if (!logo) return <span className="dot" />;
  return (
    <span className="campus-logo" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt={`${name} logo`} />
    </span>
  );
}
