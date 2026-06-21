"use server";

export async function checkSecret(providedSecret: string): Promise<{ isValid: boolean; isRequired: boolean }> {
  const secret = process.env.BAND_SECRET;
  if (!secret) {
    return { isValid: true, isRequired: false };
  }
  return { isValid: secret === providedSecret, isRequired: true };
}

export async function isSecretRequired(): Promise<boolean> {
  return !!process.env.BAND_SECRET;
}
