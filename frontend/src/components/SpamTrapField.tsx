// A field people never see: hidden off-screen, skipped by Tab, and hidden from screen readers.
// Automated scripts tend to fill every field; the server quietly discards submissions where this one
// has a value (backend validation/fields.ts, isLikelySpam).
export default function SpamTrapField() {
  return <div className="spam-trap" aria-hidden="true">
    <label>Leave this field empty<input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
  </div>
}
