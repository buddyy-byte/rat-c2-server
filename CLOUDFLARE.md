# Cloudflare + origin hardening for Chemical Umbra
#
# I cannot orange-cloud chemical-umbra.vercel.app from this machine — that
# needs your Cloudflare account. Origin is already hardened (headers, login
# lockout, CF-Connecting-IP). Do this in the dashboard once:

# 1. Add the site (or a custom domain you own) in Cloudflare.
# 2. If using a custom domain (recommended):
#      CNAME  c2.yourdomain.com  ->  cname.vercel-dns.com   (proxied / orange cloud)
#    Then in Vercel: Project → Domains → add c2.yourdomain.com
# 3. SSL/TLS → Full (strict). Always Use HTTPS on. Minimum TLS 1.2.
# 4. Security → WAF:
#      - Super Bot Fight Mode: On (definitely automated)
#      - Security Level: High
#      - Challenge Passage: 30 minutes
#      - Managed Challenge on /login and /api/auth/*
# 5. Security → Settings:
#      - Browser Integrity Check: On
#      - Hotlink Protection: On
# 6. Speed is optional. Do NOT enable Rocket Loader — it rewrites JS and
#    will blank the SPA.
# 7. Rules → Configuration Rules (or WAF custom rule):
#      (http.request.uri.path contains "/api/auth/login")
#      or (http.request.uri.path contains "/api/auth/register")
#      → Managed Challenge
#      Rate limit: 10 req / 1 min / IP on those two paths → Block 15 min
# 8. Turnstile (optional, login page): create a widget, put the site key
#    in Vercel env TURNSTILE_SITE_KEY. Origin already reads CF-Connecting-IP
#    so lockout tracks the real client, not the Cloudflare edge.

# Cloudflare API (if you later hand me a token):
#   CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID
#   then we can PUT the WAF rules from here. Until then, the origin
#   lockout (8 fails → 15 min, 20 auth POSTs/min → 2 min) is live.
