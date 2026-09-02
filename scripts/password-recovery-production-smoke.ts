import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const redirectTo = "https://stavuno.pages.dev/reset-password";
if (!url || !anonKey || !serviceKey) throw new Error("PASSWORD_RECOVERY_SMOKE_ENV_REQUIRED");

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `password-recovery-smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
const oldPassword = `Old-${randomUUID()}-aA1!`;
const newPassword = `New-${randomUUID()}-aA1!`;
let userId = "";

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main(): Promise<void> {
  const created = await admin.auth.admin.createUser({
    email,
    password: oldPassword,
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("RECOVERY_USER_MISSING");
  userId = created.data.user.id;

  const generated = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (generated.error) throw generated.error;
  if (generated.data.properties.redirect_to !== redirectTo) throw new Error("RECOVERY_REDIRECT_REJECTED");

  const recovery = client();
  const verified = await recovery.auth.verifyOtp({
    type: "recovery",
    token_hash: generated.data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session) throw verified.error ?? new Error("RECOVERY_SESSION_MISSING");
  const updated = await recovery.auth.updateUser({ password: newPassword });
  if (updated.error) throw updated.error;
  await recovery.auth.signOut();

  const oldLogin = await client().auth.signInWithPassword({ email, password: oldPassword });
  if (!oldLogin.error) throw new Error("OLD_PASSWORD_STILL_WORKS");
  const newLogin = await client().auth.signInWithPassword({ email, password: newPassword });
  if (newLogin.error) throw newLogin.error;
  await client().auth.signOut();

  console.log("Password recovery smoke passed: redirect, recovery token, password update and new login.");
}

void main()
  .finally(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
