export function getExpFromToken(token: string): number | null {
  if (!token) return null;

  try {
    const payload64 = token.split(".")[1];
    const payload = JSON.parse(atob(payload64));
    return payload.exp;
  } catch (error) {
    console.error("Error decoding token:", error);
    return null;
  }
}

export function expiredToken(token: string): boolean {
  const exp = getExpFromToken(token);
  if (!exp) return true;

  const now = Math.floor(Date.now() / 1000);
  return exp < now;
}
