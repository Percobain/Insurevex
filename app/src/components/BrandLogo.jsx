import Image from "next/image";

/** The approved custom lettering and symbol. SVG keeps both crisp at every size. */
export default function BrandLogo({ className = "w-[180px]", light = false, priority = false }) {
  return (
    <Image
      src={`/brand/logo${light ? "-light" : ""}.svg`}
      alt="InsureVEX"
      width={1921}
      height={323}
      className={`block h-auto ${className}`}
      priority={priority}
      unoptimized
    />
  );
}
