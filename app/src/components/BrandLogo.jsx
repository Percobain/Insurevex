import Image from "next/image";

const SIZES = { logo: [1921, 323], icon: [466, 323], wordmark: [1403, 323] };

/**
 * The approved custom lettering and symbol. SVG keeps both crisp at every size.
 * variant: "logo" (symbol + lettering), "icon" (symbol only) or "wordmark" (lettering only).
 * light: the reversed artwork for dark backgrounds.
 */
export default function BrandLogo({ variant = "logo", className = "w-[180px]", light = false, priority = false, alt = "InsureVEX" }) {
  const [width, height] = SIZES[variant] || SIZES.logo;
  return (
    <Image
      src={`/brand/${variant}${light ? "-light" : ""}.svg`}
      alt={alt}
      width={width}
      height={height}
      className={`block h-auto ${className}`}
      priority={priority}
      unoptimized
    />
  );
}
