import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { parseSyntheticEmail } from '../../shared/synthetic.js';
import { captchaRequired, ctxOf, fail, type Deps } from '../context.js';
import { EXTRA_FIELDS } from '../i18n.js';
import { checkPassword, hashPassword, type Store, type User } from '../store.js';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Orqea's rules (`utils/validation.js`, `routes/api/auth.js`), with its English issue texts. */
export function emailIssues(email: string): string[] {
  const [local, domain] = email.split('@') as [string, string | undefined];
  if (!email.includes('@')) return ['Email must contain an @ symbol'];
  if (!local) return ['Email must have a local part before @ symbol'];
  if (!domain || !domain.includes('.') || domain.split('.').some((p) => !p))
    return ['Domain format is invalid (e.g., example.com)'];
  return /\s/.test(email) ? ['Email cannot contain spaces'] : [];
}

export function passwordIssues(pw: string): string[] {
  const rules: [boolean, string][] = [
    [pw.length >= 8, 'Password must be at least 8 characters'],
    [/[A-Z]/.test(pw), 'Password must include an uppercase letter'],
    [/[a-z]/.test(pw), 'Password must include a lowercase letter'],
    [/[0-9]/.test(pw), 'Password must include a number'],
    [/[^A-Za-z0-9]/.test(pw), 'Password must include a special character'],
  ];
  return rules.filter(([ok]) => !ok).map(([, why]) => why);
}

/** The username Orqea stores: the one given, else the email's local part (then validated). */
export function usernameIssues(username: string): string[] {
  const issues: string[] = [];
  if (username.length < 3) issues.push('Username must be at least 3 characters');
  if (username.length > 30) issues.push('Username must be at most 30 characters');
  if (!/^[A-Za-z0-9_-]+$/.test(username))
    issues.push('Username can only contain letters, numbers, underscore, or dash');
  return issues;
}

export function authApi(app: FastifyInstance, deps: Deps): void {
  register(app, deps);
  verifyAndLogin(app, deps, new Map());
}

function register(app: FastifyInstance, deps: Deps): void {
  const { store } = deps;
  app.post('/api/auth/register', async (req, reply) => {
    const ctx = ctxOf(req, deps);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = str(b.email);
    const password = str(b.password);
    if (!email || !password) return fail(reply, ctx, 400, 'Missing email or password');
    const username = str(b.username) || (email.split('@')[0] as string);
    const nameIssues = usernameIssues(username);
    if (nameIssues.length) return fail(reply, ctx, 400, 'Invalid username', nameIssues);
    const mailIssues = emailIssues(email);
    if (mailIssues.length) return fail(reply, ctx, 400, 'Invalid email', mailIssues);
    const pwIssues = passwordIssues(password);
    if (pwIssues.length) return fail(reply, ctx, 400, 'Weak password', pwIssues);
    // Friction scenarios the real Orqea does not have (fake-only).
    const extras = EXTRA_FIELDS.slice(0, ctx.scenario.extraSignupFields);
    if (extras.some((k) => !str(b[k]))) return fail(reply, ctx, 400, 'Missing required fields');
    if (captchaRequired(reply, ctx) && b.captcha !== true)
      return fail(reply, ctx, 400, 'Captcha required');
    if (store.userByEmail(email)) return fail(reply, ctx, 409, 'User already exists');
    const user: User = {
      id: store.id(),
      email,
      username,
      passwordHash: hashPassword(password),
      verified: false,
      verifyToken: randomBytes(24).toString('hex'),
      language: ctx.view.lang,
      theme: 'dark',
      plan: 'free',
      onboardingDismissed: false,
      createdAt: deps.config.nowS(),
      runId: parseSyntheticEmail(email)?.runId ?? null,
    };
    store.users.set(user.id, user);
    // No mail ever leaves for @synthetic.invalid: Orqea reads that as `queued`.
    return reply.code(201).send({ id: user.id, email, username, emailDelivery: 'queued' as const });
  });
}

/** Marks the account of `token` verified; the one used link is then gone (like Orqea). */
export function verifyToken(store: Store, token: string | undefined): User | undefined {
  const user = [...store.users.values()].find((u) => token && u.verifyToken === token);
  if (user) {
    user.verified = true;
    user.verifyToken = '';
  }
  return user;
}

function verifyAndLogin(app: FastifyInstance, deps: Deps, brakes: Map<string, number[]>): void {
  const { store } = deps;
  app.get('/api/auth/verify-email', async (req, reply) => {
    const ctx = ctxOf(req, deps);
    const token = (req.query as Record<string, string | undefined>).token;
    if (!token) return fail(reply, ctx, 400, 'Missing token');
    if (!verifyToken(store, token)) return fail(reply, ctx, 400, 'Invalid or already used token');
    return { message: 'Email verified' };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const ctx = ctxOf(req, deps);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = str(b.email);
    const password = str(b.password);
    if (!email || !password) return fail(reply, ctx, 400, 'Missing email or password');
    const now = deps.config.nowS();
    const recent = (brakes.get(req.ip) ?? []).filter((t) => now - t < 60);
    if (!ctx.runId && recent.length >= 5)
      return reply.code(429).send({ message: 'Too many attempts. Please try again later.' });
    const user = store.userByEmail(email);
    if (!user || !checkPassword(password, user.passwordHash)) {
      brakes.set(req.ip, [...recent, now]);
      return fail(reply, ctx, 401, 'Invalid credentials');
    }
    if (!user.verified) return fail(reply, ctx, 403, 'Email not verified');
    return { token: store.issueToken(user) };
  });
}
