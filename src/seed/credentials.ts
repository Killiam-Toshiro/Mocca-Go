export interface SeedCredentials {
  adminPassword: string;
  operatorPassword: string;
}

export function seedCredentials(
  environment: Record<string, unknown>,
): SeedCredentials {
  const values: string[] = [];
  for (const variable of ['SEED_ADMIN_PASSWORD', 'SEED_OPERATOR_PASSWORD']) {
    const value = environment[variable];
    if (
      typeof value !== 'string' ||
      value.trim().length < 12 ||
      value.length > 128
    ) {
      throw new Error(`${variable} debe tener entre 12 y 128 caracteres.`);
    }
    values.push(value);
  }
  return { adminPassword: values[0], operatorPassword: values[1] };
}
