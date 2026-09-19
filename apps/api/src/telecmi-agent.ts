const PLACEHOLDER_AGENT_NAMES = new Set(["unknown", "undefined", "null", "n/a", "na", "-"]);

export function telecmiAgentAliases(value: unknown): string[] {
  const id = String(value ?? "").trim();
  if (!id) return [];
  const extension = id.match(/^(\d+)_/)?.[1];
  return extension && extension !== id ? [id, extension] : [id];
}

export function isTelecmiAgentAlias(left: unknown, right: unknown): boolean {
  const leftAliases = telecmiAgentAliases(left);
  const rightAliases = new Set(telecmiAgentAliases(right));
  return leftAliases.some((alias) => rightAliases.has(alias));
}

export function meaningfulTelecmiAgentName(value: unknown): string | undefined {
  const name = String(value ?? "").trim();
  return name && !PLACEHOLDER_AGENT_NAMES.has(name.toLowerCase()) ? name : undefined;
}
