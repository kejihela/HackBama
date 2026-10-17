import { CategoryIcon } from "./CategoryIcon";
import { onColor } from "@/lib/format";

/** Listing photo, or a generated tile in the seller's school colors when there's no photo. */
export function ListingTile({
  image,
  category,
  color,
  course,
  corner,
}: {
  image: string | null;
  category: string;
  color: string;
  course?: string | null;
  corner?: React.ReactNode;
}) {
  const fg = onColor(color);
  return (
    <div
      className="tile"
      style={image ? undefined : { background: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 70%, #000) 100%)` }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={/^https?:\/\//.test(image) ? image : image.startsWith("seed/") ? `/${image}` : `/api/uploads/${image}`} alt="" loading="lazy" />
      ) : (
        <CategoryIcon category={category} className="glyph" color={fg} />
      )}
      {course && <span className="course">{course}</span>}
      {corner && <span className="campus-corner">{corner}</span>}
    </div>
  );
}
