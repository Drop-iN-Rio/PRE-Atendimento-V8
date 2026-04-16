import pg from 'pg';
import bcrypt from 'bcryptjs';

interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  active: boolean;
}

function getClient() {
  return new pg.Client({
    connectionString: process.env.SUPABASE_POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });
}

export async function loginUser(email: string, password: string) {
  const client = getClient();
  try {
    await client.connect();
    const { rows } = await client.query<User>(
      `SELECT id, name, email, password_hash, role, active
       FROM public.users
       WHERE email = $1
       LIMIT 1`,
      [email.toLowerCase().trim()]
    );

    if (!rows.length) {
      return { success: false, error: 'E-mail ou senha incorretos.' };
    }

    const user = rows[0];

    if (!user.active) {
      return { success: false, error: 'Conta desativada. Fale com o administrador.' };
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return { success: false, error: 'E-mail ou senha incorretos.' };
    }

    return {
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  } finally {
    await client.end();
  }
}

export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: string
) {
  const client = getClient();
  try {
    await client.connect();

    const { rows: existing } = await client.query(
      'SELECT id FROM public.users WHERE email = $1 LIMIT 1',
      [email.toLowerCase().trim()]
    );

    if (existing.length) {
      return { success: false, error: 'Já existe uma conta com este e-mail.' };
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await client.query<User>(
      `INSERT INTO public.users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, email, role`,
      [name.trim(), email.toLowerCase().trim(), password_hash, role]
    );

    const user = rows[0];
    return {
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  } finally {
    await client.end();
  }
}
