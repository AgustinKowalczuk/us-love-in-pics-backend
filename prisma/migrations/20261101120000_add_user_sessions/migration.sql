-- Create the session storage table.
CREATE TABLE "user_sessions" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- Create an index for session expiration.
CREATE INDEX "IDX_session_expire"
ON "user_sessions"("expire");