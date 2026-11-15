import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";

import { env } from "./env.js";

const PgSession = connectPgSimple(session);

const sessionPool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const sessionMiddleware = session({
  store: new PgSession({
    pool: sessionPool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),

  name: "uslove.sid",
  secret: env.SESSION_SECRET,

  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: env.SESSION_MAX_AGE,
  },
});