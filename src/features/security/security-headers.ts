export function securityHeaders(development = false): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://*.supabase.co${development ? " http://*:* https://*:*" : ""}`,
      `media-src 'self' blob: https://*.supabase.co${development ? " http://*:* https://*:*" : ""}`,
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co${development ? " http://*:* https://*:* ws://*:* wss://*:*" : ""}`,
      "worker-src 'self' blob:",
      ...(development ? [] : ["upgrade-insecure-requests"]),
    ].join("; "),
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}
