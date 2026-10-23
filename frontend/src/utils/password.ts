// Matches the server's rule (backend validation/adminSession.ts); the server checks again.
export const MIN_PASSWORD_LENGTH = 15

// Field messages for the "new password" and "new password again" boxes (components/admin/NewPasswordFields).
export function newPasswordErrors(formData: FormData): Record<string, string> {
  const newPassword = String(formData.get('newPassword') ?? '')
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { newPassword: `Use at least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words make a strong, memorable password.` }
  if (newPassword !== String(formData.get('confirmPassword') ?? '')) return { confirmPassword: 'The two new passwords do not match.' }
  return {}
}
