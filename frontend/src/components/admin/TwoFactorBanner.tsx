import { twoFactorContent } from '../../data/adminContent'

interface TwoFactorBannerProps {
  onDismiss: () => void
}

// Suggests two-step login to an admin who has not turned it on. "Not now" closes it until the next
// login (the server remembers it for this session); it does not appear once two-step login is on.
export default function TwoFactorBanner({ onDismiss }: TwoFactorBannerProps) {
  return <aside className="admin-two-factor-banner" aria-labelledby="admin-two-factor-banner-title">
    <div>
      <h2 id="admin-two-factor-banner-title">{twoFactorContent.banner.title}</h2>
      <p>{twoFactorContent.banner.text}</p>
    </div>
    <div className="admin-two-factor-banner-actions">
      <a className="button button-primary" href="#admin/security">{twoFactorContent.banner.action}</a>
      <button type="button" className="button button-outline" onClick={onDismiss}>{twoFactorContent.banner.dismiss}</button>
    </div>
  </aside>
}
