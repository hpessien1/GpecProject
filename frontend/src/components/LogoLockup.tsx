// The GPEC logo in every header. Shown 180px wide (124px on phones), so it loads resized WebP copies
// of public/assets/gpec-engineering-logo-plinth.png (about 30-50 kB instead of 1.1 MB); the browser
// picks the copy that stays sharp on the screen in use. width and height reserve its space while it
// loads.
export default function LogoLockup() {
  return <img
    className="brand-logo"
    src="/assets/gpec-engineering-logo-plinth-360.webp"
    srcSet="/assets/gpec-engineering-logo-plinth-360.webp 360w, /assets/gpec-engineering-logo-plinth-540.webp 540w"
    sizes="(max-width: 820px) 124px, 180px"
    width={360}
    height={217}
    alt="GPEC Engineering logo on a plinth"
  />
}
