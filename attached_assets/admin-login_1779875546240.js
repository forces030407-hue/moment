const db = require('./utils/db');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { username, password, supabaseUrl, supabaseKey } = JSON.parse(event.body);

    if (!username || !password) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Username and password are required' }),
      };
    }

    const normalizedUsername = username.trim().toLowerCase();

    // 1. Try local admin authentication (by username or email)
    let admin = null;
    for (const [email, adminData] of db.admins) {
      if (adminData.username === username || email.toLowerCase() === normalizedUsername) {
        admin = { email, ...adminData };
        break;
      }
    }

    if (admin && admin.password === password) {
      // Generate stateless token for local admin
      const token = db.generateToken(admin.email);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          success: true,
          message: 'Login successful (local admin)',
          token,
          email: admin.email,
        }),
      };
    }

    // 2. Fallback to Supabase Auth if local authentication failed
    const targetUrl = supabaseUrl || process.env.SUPABASE_URL;
    const targetKey = supabaseKey || process.env.SUPABASE_ANON_KEY;

    if (targetUrl && targetKey && targetUrl !== 'YOUR_SUPABASE_URL' && targetKey !== 'YOUR_ANON_KEY') {
      try {
        console.log('[Auth] Attempting Supabase auth for:', normalizedUsername);
        const response = await fetch(`${targetUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': targetKey,
          },
          body: JSON.stringify({ email: normalizedUsername, password }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.user && data.access_token) {
          console.log('[Auth] Supabase auth successful for:', data.user.email);
          const token = db.generateToken(data.user.email);
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              ...CORS_HEADERS,
            },
            body: JSON.stringify({
              success: true,
              message: 'Login successful (Supabase)',
              token,
              email: data.user.email,
            }),
          };
        } else {
          console.warn('[Auth] Supabase auth failed:', data.error_description || data.error || response.statusText);
        }
      } catch (supabaseError) {
        console.error('[Auth] Supabase request error:', supabaseError);
      }
    }

    // Both local and Supabase authentication failed
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid username or password' }),
    };
  } catch (error) {
    console.error('Admin login error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
