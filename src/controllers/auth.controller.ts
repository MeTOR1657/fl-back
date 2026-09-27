import type {
  Request,
  Response,
} from "express";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../config/db.js";
import { env } from "../config/env.js";

import {
  users,
} from "../db/schema.js";

import {
  generateToken,
} from "../utils/jwt.js";

function safeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    studentId: user.studentId,
    faculty: user.faculty,
    major: user.major,
    avatarUrl: user.avatarUrl,
    role: user.role,
    teamId: user.teamId,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function register(
  req: Request,
  res: Response
) {
  try {
    const {
      fullName,
      email,
      password,
    } = req.body;

    if (typeof fullName !== "string" || typeof email !== "string" || typeof password !== "string" ||
        !fullName.trim() || !email.trim() || !password) {
      return res.status(400).json({
        message:
          "fullName, email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters",
      });
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    const existing =
      await db
        .select()
        .from(users)
        .where(
          eq(
            users.email,
            normalizedEmail
          )
        )
        .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        message: "Email already exists",
      });
    }

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );

    const [user] =
      await db
        .insert(users)
        .values({
          fullName: fullName.trim(),
          email: normalizedEmail,
          passwordHash,
          role: "REPORTER",
        })
        .returning();

    const accessToken =
      generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

    return res.status(201).json({
      accessToken,
      user: safeUser(user),
    });
  } catch {
    return res.status(500).json({
      message: "Registration failed",
    });
  }
}

export async function login(
  req: Request,
  res: Response
) {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    const result =
      await db
        .select()
        .from(users)
        .where(
          eq(
            users.email,
            normalizedEmail
          )
        )
        .limit(1);

    if (result.length === 0) {
      return res.status(401).json({
        message:
          "Invalid email or password",
      });
    }

    const user = result[0];

    if (!user.passwordHash) {
      return res.status(400).json({
        message:
          "This account uses Google sign-in. Please continue with Google.",
      });
    }

    const valid =
      await bcrypt.compare(
        password,
        user.passwordHash
      );

    if (!valid) {
      return res.status(401).json({
        message:
          "Invalid email or password",
      });
    }

    await db
      .update(users)
      .set({
        lastLoginAt: new Date(),
      })
      .where(
        eq(users.id, user.id)
      );

    const accessToken =
      generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

    return res.json({
      accessToken,
      user: safeUser({
        ...user,
        lastLoginAt: new Date(),
      }),
    });
  } catch {
    return res.status(500).json({
      message: "Login failed",
    });
  }
}

const oauthStateCookie = "google_oauth_state";
const cookieOptions = `HttpOnly; SameSite=Lax; Path=/auth/google${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;

export function startGoogleOAuth(_req: Request, res: Response) {
  if (!env.googleClientId || !env.googleClientSecret) {
    return res.status(503).json({ message: "Google sign-in is not configured" });
  }

  const state = randomBytes(32).toString("hex");
  res.setHeader("Set-Cookie", `${oauthStateCookie}=${state}; ${cookieOptions}; Max-Age=600`);
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return res.redirect(302, authorizationUrl.toString());
}

export async function googleOAuthCallback(req: Request, res: Response) {
  const frontend = new URL(env.frontendUrl);
  const fail = (reason: string) => {
    frontend.pathname = "/";
    frontend.search = new URLSearchParams({ auth_error: reason }).toString();
    frontend.hash = "";
    return res.redirect(302, frontend.toString());
  };

  const cookie = req.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${oauthStateCookie}=`));
  const storedState = cookie?.slice(oauthStateCookie.length + 1);
  const state = typeof req.query.state === "string" ? req.query.state : "";
  res.setHeader("Set-Cookie", `${oauthStateCookie}=; ${cookieOptions}; Max-Age=0`);

  if (!storedState || !state || storedState !== state) return fail("invalid_oauth_state");
  if (typeof req.query.error === "string") return fail("google_sign_in_cancelled");
  if (typeof req.query.code !== "string") return fail("missing_authorization_code");
  if (!env.googleClientId || !env.googleClientSecret) return fail("google_sign_in_not_configured");

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return fail("google_token_exchange_failed");
    const tokenData: unknown = await tokenResponse.json();
    if (!tokenData || typeof tokenData !== "object" || !("access_token" in tokenData) || typeof tokenData.access_token !== "string") {
      return fail("invalid_google_token_response");
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!profileResponse.ok) return fail("google_profile_lookup_failed");
    const profile: unknown = await profileResponse.json();
    if (!profile || typeof profile !== "object" || !("sub" in profile) || typeof profile.sub !== "string" ||
        !("email" in profile) || typeof profile.email !== "string" ||
        !("email_verified" in profile) || profile.email_verified !== true ||
        !("name" in profile) || typeof profile.name !== "string") {
      return fail("google_profile_not_verified");
    }

    const email = profile.email.trim().toLowerCase();
    const [byGoogleId] = await db.select().from(users).where(eq(users.googleId, profile.sub)).limit(1);
    const [byEmail] = byGoogleId ? [undefined] : await db.select().from(users).where(eq(users.email, email)).limit(1);
    const existing = byGoogleId ?? byEmail;
    const now = new Date();
    const [user] = existing
      ? await db.update(users).set({
          googleId: profile.sub,
          fullName: existing.fullName || profile.name,
          avatarUrl: "picture" in profile && typeof profile.picture === "string" ? profile.picture : existing.avatarUrl,
          lastLoginAt: now,
        }).where(eq(users.id, existing.id)).returning()
      : await db.insert(users).values({
          googleId: profile.sub,
          email,
          fullName: profile.name,
          avatarUrl: "picture" in profile && typeof profile.picture === "string" ? profile.picture : null,
          role: "REPORTER",
          lastLoginAt: now,
        }).returning();

    const accessToken = generateToken({ userId: user.id, email: user.email, role: user.role });
    frontend.pathname = "/";
    frontend.search = "";
    frontend.hash = new URLSearchParams({ access_token: accessToken, token_type: "Bearer" }).toString();
    return res.redirect(302, frontend.toString());
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return fail("google_sign_in_failed");
  }
}
