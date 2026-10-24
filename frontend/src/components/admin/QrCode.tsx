import QRCode from 'qrcode'

interface QrCodeProps {
  // The otpauth:// link an authenticator app reads.
  value: string
  label: string
}

// Drawn as one SVG path from the QR code's grid, dark on white with the quiet border scanners need.
// Nothing is sent anywhere: the code is made in the browser from the link the server gave.
export default function QrCode({ value, label }: QrCodeProps) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const border = 4
  const size = modules.size + border * 2
  let path = ''
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) path += `M${column + border} ${row + border}h1v1h-1z`
    }
  }
  return <svg className="admin-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
    <rect width={size} height={size} fill="#fff" />
    <path d={path} fill="#000" />
  </svg>
}
