import bcrypt from "bcryptjs";

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 10);
};

export const verifyPassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};

// Precomputed bcrypt hash (cost 10) of a throwaway string. Used to burn the
// same CPU time as a real comparison when the account doesn't exist or has no
// password, so response time can't be used to enumerate registered emails.
const DUMMY_HASH = "$2b$10$kW2Ko/HKe8.CDcv.lE/1au1nC3vCKW68mxoTJ9tRWU4im9W1ktf0K";

export const dummyPasswordCheck = async (password: string): Promise<false> => {
  await bcrypt.compare(password, DUMMY_HASH);
  return false;
};
