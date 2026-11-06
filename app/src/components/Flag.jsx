import { AU, BR, CA, CH, CN, DE, ES, FR, GB, HK, ID, IN, IT, JP, KR, MX, NL, SA, SE, SG, TW, US, ZA } from "country-flag-icons/react/3x2";

/** Real flag artwork (SVG, 3:2) for the exchange countries. `code` is the ISO 3166 alpha-2 code. */
const FLAGS = { AU, BR, CA, CH, CN, DE, ES, FR, GB, HK, ID, IN, IT, JP, KR, MX, NL, SA, SE, SG, TW, US, ZA };

export default function Flag({ code, className = "", title, ...rest }) {
  const F = FLAGS[code?.toUpperCase()];
  if (!F) return null;
  return <F title={title} className={className} preserveAspectRatio="xMidYMid slice" {...rest} />;
}
