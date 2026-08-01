import Image from "next/image";
import Link from "next/link";

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link className="site-logo" href="/" aria-label="FixMap home">
      <Image
        src={inverse ? "/fixmap-logo-inverse.png" : "/fixmap-logo.png"}
        alt="FixMap"
        width={1097}
        height={279}
        priority
        unoptimized
      />
    </Link>
  );
}
