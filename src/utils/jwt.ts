import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env.js";

export interface JwtPayload {
  userId: string;
  email: string;
  role: "REPORTER" | "STAFF" | "ADMIN";
}

export function generateToken(payload: JwtPayload): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const expiresInSeconds = parseDuration(env.jwtExpiresIn);
  const body = base64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }));
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${signature(unsigned)}`;
}

export function verifyToken(token: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signature(unsigned));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid token signature");
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) {
    throw new Error("Expired token");
  }
  if (typeof payload.userId !== "string" || typeof payload.email !== "string" ||
      !["REPORTER", "STAFF", "ADMIN"].includes(payload.role)) {
    throw new Error("Invalid token payload");
  }
  return { userId: payload.userId, email: payload.email, role: payload.role };
}

function signature(value: string): string {
  return createHmac("sha256", env.jwtSecret).update(value).digest("base64url");
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function parseDuration(value: string): number {
  const match = /^(\d+)(s|m|h|d)?$/.exec(value);
  if (!match) throw new Error("JWT_EXPIRES_IN must be a number followed by s, m, h, or d");
  const scale = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  return Number(match[1]) * scale[(match[2] ?? "s") as keyof typeof scale];
}
