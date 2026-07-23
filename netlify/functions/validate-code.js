// MillwrightIQ Pro — access-code validation (MVP).
//
// Validates a submitted access code against the PRO_ACCESS_CODES environment
// variable (comma-separated list), which is configured in the Netlify dashboard
// and NEVER committed to the repo or exposed to the browser.
//
// Security notes:
//   - Never logs the submitted code or the code list.
//   - Never returns the list of valid codes — only a boolean.
//   - Fails closed: any error or missing config resolves to { valid: false }.
//
// MVP-only: a comma-separated env var is fine for the first handful of customers.
// Move access records to Netlify Blobs / Supabase before scaling further.

exports.handler = async (event) => {
  // Only accept POST.
  if (event.httpMethod !== 'POST') {
    return json(405, { valid: false });
  }

  // Parse the submitted code.
  let code = '';
  try {
    const body = JSON.parse(event.body || '{}');
    code = String(body.code || '').trim().toUpperCase();
  } catch (e) {
    return json(400, { valid: false });
  }

  if (!code) {
    return json(200, { valid: false });
  }

  // Compare against the configured list (trimmed, case-insensitive).
  const raw = process.env.PRO_ACCESS_CODES || '';
  const validCodes = raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const isValid = validCodes.includes(code);

  return json(200, { valid: isValid });
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(payload),
  };
}
