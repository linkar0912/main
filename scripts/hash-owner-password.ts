import { hashOwnerPassword } from "../src/lib/auth/session";

const password = process.env.OWNER_PASSWORD;
if (!password || password.length < 12) {
  console.error("Set OWNER_PASSWORD to a password with at least 12 characters.");
  process.exit(1);
}

console.log(hashOwnerPassword(password));
