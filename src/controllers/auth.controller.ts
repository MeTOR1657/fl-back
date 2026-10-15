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
    frontend.pathname = user.role === "ADMIN" || user.role === "STAFF" ? "/dashboard" : "/tickets";
    frontend.search = "";
    frontend.hash = new URLSearchParams({ access_token: accessToken, token_type: "Bearer" }).toString();
    return res.redirect(302, frontend.toString());
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return fail("google_sign_in_failed");
  }
}

export async function cmuOAuthExchange(req: Request, res: Response) {
  try {
    const { code, redirectUri, clientId, clientSecret } = req.body ?? {};
    if (!code || typeof code !== "string") {
      return res.status(400).json({ success: false, error: "code is required" });
    }

    const cId = clientId || env.cmuClientId;
    const cSec = clientSecret || env.cmuClientSecret;
    const rUri = redirectUri || env.cmuRedirectUri;

    const tokenParams = new URLSearchParams({
      code: code.trim(),
      redirect_uri: rUri,
      client_id: cId,
      client_secret: cSec,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth497.cpecmu.com/application/o/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return res.status(tokenRes.status).json({
        success: false,
        error: `Token exchange returned status ${tokenRes.status}: ${errText}`,
      });
    }

    const tokenData: any = await tokenRes.json();
    const accessTokenOAuth = tokenData.access_token || tokenData.token;
    if (!accessTokenOAuth) {
      return res.status(400).json({
        success: false,
        error: tokenData.message || tokenData.error_description || "No access token received",
      });
    }

    const userRes = await fetch("https://oauth497.cpecmu.com/application/o/userinfo/", {
      headers: { Authorization: `Bearer ${accessTokenOAuth}` },
    });

    let rawUserData: any = {};
    if (userRes.ok) {
      rawUserData = await userRes.json();
    }

    const username = rawUserData.preferred_username || rawUserData.nickname || rawUserData.name || "cmu.student";
    const email = (rawUserData.email || `${username}@cmu.ac.th`).trim().toLowerCase();
    const nameParts = (rawUserData.name || "").split(" ");
    const firstName = rawUserData.name_th || rawUserData.given_name || nameParts[0] || username;
    const lastName = rawUserData.surname_th || rawUserData.family_name || nameParts.slice(1).join(" ") || "";
    const fullName = `${firstName} ${lastName}`.trim();
    const studentId = username.match(/^\d{9}$/) ? username : (rawUserData.student_id || null);
    const faculty = rawUserData.organization_name_TH || rawUserData.organization_name_EN || "Faculty of Engineering";
    const major = rawUserData.major || "Computer Engineering";
    const isStaff = email.includes("admin") || email.includes("staff") || username === "bimcub12345";
    const role = isStaff ? "ADMIN" : "REPORTER";

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const now = new Date();
    let dbUser: typeof users.$inferSelect;

    if (existing) {
      const [updated] = await db
        .update(users)
        .set({
          fullName: existing.fullName || fullName,
          studentId: existing.studentId || studentId,
          faculty: existing.faculty || faculty,
          major: existing.major || major,
          lastLoginAt: now,
        })
        .where(eq(users.id, existing.id))
        .returning();
      dbUser = updated;
    } else {
      const dummyPassword = await bcrypt.hash(randomBytes(16).toString("hex"), 10);
      const [created] = await db
        .insert(users)
        .values({
          email,
          fullName,
          studentId,
          faculty,
          major,
          role,
          passwordHash: dummyPassword,
          lastLoginAt: now,
        })
        .returning();
      dbUser = created;
    }

    const jwtToken = generateToken({
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
    });

    const cmuUserProfile = {
      cmuitaccount_name: username,
      cmuitaccount: email,
      firstname_TH: firstName,
      firstname_EN: rawUserData.name_en || firstName,
      lastname_TH: lastName,
      lastname_EN: rawUserData.surname_en || lastName,
      student_id: studentId || "",
      organization_code: "06",
      organization_name_TH: faculty,
      organization_name_EN: rawUserData.organization_name_EN || faculty,
      itaccounttype_id: isStaff ? "StaffAcc" : "StdAcc",
      itaccounttype_TH: isStaff ? "บุคลากร" : "นักศึกษา",
      itaccounttype_EN: isStaff ? "Staff" : "Student",
    };

    return res.json({
      success: true,
      accessToken: jwtToken,
      user: safeUser(dbUser),
      cmuProfile: cmuUserProfile,
    });
  } catch (error: any) {
    console.error("CMU OAuth exchange failed:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Internal server error during CMU OAuth exchange",
    });
  }
}

export async function cmuTestLogin(req: Request, res: Response) {
  try {
    const { accountName, role: requestedRole } = req.body ?? {};
    const acct = (typeof accountName === "string" && accountName.trim()) ? accountName.trim() : "student";
    const email = (acct.includes("@") ? acct : `${acct}@cmu.ac.th`).toLowerCase();
    const isStaff = requestedRole === "admin" || email.includes("admin") || acct === "bimcub12345";
    const role = isStaff ? "ADMIN" : "REPORTER";
    const studentId = acct.match(/\d{9}/) ? acct : (isStaff ? null : "650610123");
    const fullName = isStaff ? "Admin Supakorn Suksomboon" : "Supakorn Suksomboon";

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const now = new Date();
    let dbUser: typeof users.$inferSelect;

    if (existing) {
      const [updated] = await db
        .update(users)
        .set({ role, lastLoginAt: now })
        .where(eq(users.id, existing.id))
        .returning();
      dbUser = updated;
    } else {
      const dummyPassword = await bcrypt.hash("123456", 10);
      const [created] = await db
        .insert(users)
        .values({
          email,
          fullName,
          studentId,
          role,
          passwordHash: dummyPassword,
          lastLoginAt: now,
        })
        .returning();
      dbUser = created;
    }

    const jwtToken = generateToken({
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
    });

    const cmuUserProfile = {
      cmuitaccount_name: acct.replace("@cmu.ac.th", ""),
      cmuitaccount: email,
      firstname_TH: isStaff ? "แอดมินฝ่ายอาคาร" : "ศุภกร",
      firstname_EN: isStaff ? "Facility Admin" : "Supakorn",
      lastname_TH: isStaff ? "มช." : "สุขสมบูรณ์",
      lastname_EN: isStaff ? "CMU" : "Suksomboon",
      student_id: studentId || "",
      organization_code: "06",
      organization_name_TH: isStaff ? "สำนักงานบริหารจัดการอาคารและสถานที่" : "ภาควิชาวิศวกรรมคอมพิวเตอร์",
      organization_name_EN: isStaff ? "CMU Facilities" : "Department of Computer Engineering",
      itaccounttype_id: isStaff ? "StaffAcc" : "StdAcc",
      itaccounttype_TH: isStaff ? "บุคลากร" : "นักศึกษา",
      itaccounttype_EN: isStaff ? "Staff" : "Student",
    };

    return res.json({
      success: true,
      accessToken: jwtToken,
      user: safeUser(dbUser),
      cmuProfile: cmuUserProfile,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || "Test login failed" });
  }
}

