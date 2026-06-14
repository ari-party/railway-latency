export function renderAuthorizedKeys(
  adminKeys: string[],
  automationPublicKey: string,
): string {
  const lines = [...adminKeys, automationPublicKey]
    .map((key) => key.trim())
    .filter(Boolean)
    .join('\n');
  return `${lines}\n`;
}
