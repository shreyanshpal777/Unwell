import "dotenv/config";

function isSupabaseHost(host) {
  return host.endsWith(".supabase.co") || host.endsWith(".supabase.com");
}

export function resolveSsl(connectionString) {
  let url;

  try {
    url = new URL(connectionString);
  } catch {
    return undefined;
  }

  const mode = url.searchParams.get("sslmode");

  if (mode === "disable") return false;
  if (mode === "verify-ca" || mode === "verify-full") return true;
  if (mode === "prefer" || mode === "require" || mode === "no-verify") {
    return { rejectUnauthorized: false };
  }

  if (isSupabaseHost(url.hostname.toLowerCase())) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

function withoutSslMode(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

export function buildConnectionConfig(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy backend/.env.example to backend/.env and configure it."
    );
  }

  const ssl = resolveSsl(connectionString);

  if (ssl === undefined) {
    return { connectionString };
  }

  return {
    connectionString: withoutSslMode(connectionString),
    ssl
  };
}

export const connectionConfig = buildConnectionConfig();
