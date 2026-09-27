import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters");
}

export const env = {
  port: Number(process.env.PORT ?? 3000),

  databaseUrl,

  frontendUrl:
    process.env.FRONTEND_URL ??
    "http://localhost:5173",

  uploadDir: process.env.UPLOAD_DIR ?? "uploads",

  jwtSecret,

  jwtExpiresIn:
    process.env.JWT_EXPIRES_IN ?? "7d",

  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/auth/google/callback",
};
