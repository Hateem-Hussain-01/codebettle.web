/**
 * In-memory fake Prisma client for tests (Phase 2).
 *
 * TEST-ONLY. Never imported by application code. The repositories call
 * getDb(), which tests swap to a fake via __setDbClient — so repository
 * and service tests run without a live database (this VM cannot reach
 * Postgres at all).
 *
 * The fake implements the fluent surface the repositories actually use:
 * where (object shorthand + lambda with field accessors), include
 * (1-2 levels, with orderBy inside), select, orderBy, limit, offset,
 * first, all, create, update, delete, updateAll, deleteAll, transaction.
 * It does NOT implement aggregate/groupBy/upsert — no repository uses
 * them yet; add them when one does.
 *
 * Semantics it mimics on purpose:
 * - create() generates a cuid-like id when none is given, and stamps
 *   createdAt/updatedAt/joinedAt/enrolledAt/issuedAt/publishedAt with
 *   new Date() when the caller omits them (the real DB defaults do this).
 * - update/delete on a filtered collection apply to every matching row
 *   but return the FIRST updated/deleted row (or null) — matching how
 *   the repositories use them (always filtered by a unique id).
 * - transaction() runs the callback against the same tables with no
 *   rollback — the repositories do not use transactions yet.
 */
import type { DbClient } from '../lib/db/client';

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
type SortSpec = { field: string; dir: 'asc' | 'desc' };

const TIMESTAMP_DEFAULTS = new Set([
  'createdAt',
  'updatedAt',
  'joinedAt',
  'enrolledAt',
  'issuedAt',
  'publishedAt',
  'submittedAt',
]);

/** Relations the repositories include: parent model -> relation -> child model + FK. */
const RELATIONS: Record<string, Record<string, { model: string; fk: string }>> = {
  Course: { modules: { model: 'Module', fk: 'courseId' } },
  Module: { lessons: { model: 'Lesson', fk: 'moduleId' } },
  Quiz: { questions: { model: 'QuizQuestion', fk: 'quizId' } },
  QuizQuestion: { options: { model: 'QuizOption', fk: 'questionId' } },
  QuizAttempt: { answers: { model: 'QuizAnswer', fk: 'attemptId' } },
};

/** Nullable columns per model. The real database stores NULL for an
 * omitted nullable field; the fake must do the same, or code that
 * checks `row.x !== null` would see `undefined` and misbehave. */
const NULLABLE_FIELDS: Record<string, string[]> = {
  User: ['avatar', 'bio', 'phone', 'notificationPrefs', 'deletedAt', 'emailVerifiedAt'],
  Course: ['longDescription', 'thumbnail', 'zoomLink', 'schedule', 'completedAt'],
  Lesson: ['videoUrl', 'content', 'date'],
  Enrollment: ['completedAt', 'couponUsed', 'deletedAt'],
  Announcement: ['courseId'],
  ContactMessage: ['subject'],
  Notification: ['readAt'],
  BlogPost: ['pdfUrl'],
  Session: ['revokedAt', 'ip', 'userAgent'],
  AuditLog: ['entityId', 'detail', 'ip'],
  LoginEvent: ['userId', 'ip', 'userAgent'],
  PasswordReset: ['usedAt'],
  EmailVerification: ['usedAt'],
  Quiz: ['description', 'difficulty', 'timeLimitMin', 'passMark', 'availableFrom', 'availableUntil', 'instructions', 'pdfUrl', 'pdfStoragePath', 'parseWarnings', 'deletedAt'],
  QuizQuestion: ['topic', 'difficulty', 'correctText', 'reviewNote'],
  QuizAttempt: ['dueAt', 'submittedAt', 'score', 'totalPoints', 'timeSpentSec'],
  QuizAnswer: ['textAnswer', 'isCorrect'],
  Note: ['courseId'],
  PaymentAccount: ['bankName', 'accountNumber', 'iban', 'walletNumber', 'instructions'],
  PaymentSubmission: ['paymentAccountId', 'proofUrl', 'reviewedBy', 'reviewedAt', 'reviewNote'],
};

let idCounter = 0;
function fakeId(model: string): string {
  idCounter += 1;
  return `fake-${model.toLowerCase()}-${idCounter}`;
}

/** Field accessor handed to where()/orderBy() lambdas. */
function makeAccessor(): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        const field = prop;
        const cmp = (op: string, value?: unknown): Predicate => {
          return (row: Row) => {
            const v = row[field];
            switch (op) {
              case 'eq':
                return v === value;
              case 'ne':
                return v !== value;
              case 'isNull':
                return v === null || v === undefined;
              case 'isNotNull':
                return v !== null && v !== undefined;
              case 'in':
                return Array.isArray(value) && value.includes(v as never);
              case 'gt':
                return typeof v === 'number' && typeof value === 'number' ? v > value : (v as Date) > (value as Date);
              case 'gte':
                return typeof v === 'number' && typeof value === 'number' ? v >= value : (v as Date) >= (value as Date);
              case 'lt':
                return typeof v === 'number' && typeof value === 'number' ? v < value : (v as Date) < (value as Date);
              case 'lte':
                return typeof v === 'number' && typeof value === 'number' ? v <= value : (v as Date) <= (value as Date);
              case 'contains':
                return typeof v === 'string' && typeof value === 'string' && v.includes(value);
              case 'ilike':
                // Case-insensitive contains; '%' wildcards are stripped (Prisma ilike pattern).
                return (
                  typeof v === 'string' &&
                  typeof value === 'string' &&
                  v.toLowerCase().includes(value.replace(/%/g, '').toLowerCase())
                );
              case 'startsWith':
                return typeof v === 'string' && typeof value === 'string' && v.startsWith(value);
              default:
                throw new Error(`FakeDb: unsupported operator ${op}`);
            }
          };
        };
        return {
          eq: (v: unknown) => cmp('eq', v),
          ne: (v: unknown) => cmp('ne', v),
          isNull: () => cmp('isNull'),
          isNotNull: () => cmp('isNotNull'),
          in: (v: unknown[]) => cmp('in', v),
          gt: (v: unknown) => cmp('gt', v),
          gte: (v: unknown) => cmp('gte', v),
          lt: (v: unknown) => cmp('lt', v),
          lte: (v: unknown) => cmp('lte', v),
          contains: (v: string) => cmp('contains', v),
          ilike: (v: string) => cmp('ilike', v),
          startsWith: (v: string) => cmp('startsWith', v),
          asc: (): SortSpec => ({ field, dir: 'asc' }),
          desc: (): SortSpec => ({ field, dir: 'desc' }),
        };
      },
    },
  );
}

interface QueryState {
  predicates: Predicate[];
  sorts: SortSpec[];
  limit?: number;
  offset?: number;
  selects?: string[];
  includes: Array<{ name: string; sub: FakeCollection }>;
}

function emptyState(): QueryState {
  return { predicates: [], sorts: [], includes: [] };
}

function cloneState(s: QueryState): QueryState {
  return {
    predicates: [...s.predicates],
    sorts: [...s.sorts],
    limit: s.limit,
    offset: s.offset,
    selects: s.selects ? [...s.selects] : undefined,
    includes: [...s.includes],
  };
}

class FakeCollection {
  constructor(
    private readonly db: FakeDb,
    private readonly model: string,
    private readonly state: QueryState = emptyState(),
  ) {}

  private rows(): Row[] {
    return [...(this.db.tables[this.model] ?? new Map()).values()];
  }

  private applyState(rows: Row[], state: QueryState): Row[] {
    let out = rows.filter((r) => state.predicates.every((p) => p(r)));
    for (const sort of [...state.sorts].reverse()) {
      out = [...out].sort((a, b) => {
        const av = a[sort.field];
        const bv = b[sort.field];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const cmp = av < bv ? -1 : 1;
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    if (state.offset !== undefined) out = out.slice(state.offset);
    if (state.limit !== undefined) out = out.slice(0, state.limit);
    // Attach included relations (before select narrowing — includes are
    // separate properties, select only narrows the row's own fields).
    for (const inc of state.includes) {
      const rel = RELATIONS[this.model]?.[inc.name];
      if (!rel) throw new Error(`FakeDb: unknown relation ${this.model}.${inc.name}`);
      for (const row of out) {
        const children = inc.sub.applyState(
          this.db.tables[rel.model] ? [...this.db.tables[rel.model].values()].filter((c) => c[rel.fk] === row.id) : [],
          inc.sub.state,
        );
        (row as Row)[inc.name] = children;
      }
    }
    if (state.selects) {
      out = out.map((r) => {
        const narrowed: Row = {};
        for (const f of state.selects!) narrowed[f] = r[f];
        return narrowed;
      });
    }
    return out;
  }

  where(arg: Record<string, unknown> | ((model: unknown) => Predicate)): FakeCollection {
    const next = cloneState(this.state);
    if (typeof arg === 'function') {
      next.predicates.push(arg(makeAccessor()));
    } else {
      for (const [field, value] of Object.entries(arg)) {
        next.predicates.push((row) => row[field] === value);
      }
    }
    return new FakeCollection(this.db, this.model, next);
  }

  include(name: string, fn?: (sub: FakeCollection) => FakeCollection): FakeCollection {
    const next = cloneState(this.state);
    const sub = fn
      ? fn(new FakeCollection(this.db, RELATIONS[this.model]?.[name]?.model ?? name))
      : new FakeCollection(this.db, RELATIONS[this.model]?.[name]?.model ?? name);
    next.includes.push({ name, sub });
    return new FakeCollection(this.db, this.model, next);
  }

  select(...fields: string[]): FakeCollection {
    const next = cloneState(this.state);
    next.selects = fields;
    return new FakeCollection(this.db, this.model, next);
  }

  orderBy(fn: (model: unknown) => SortSpec): FakeCollection {
    const next = cloneState(this.state);
    next.sorts.push(fn(makeAccessor()));
    return new FakeCollection(this.db, this.model, next);
  }

  limit(n: number): FakeCollection {
    const next = cloneState(this.state);
    next.limit = n;
    return new FakeCollection(this.db, this.model, next);
  }

  offset(n: number): FakeCollection {
    const next = cloneState(this.state);
    next.offset = n;
    return new FakeCollection(this.db, this.model, next);
  }

  async first(): Promise<Row | null> {
    const rows = this.applyState(this.rows(), this.state);
    return rows[0] ?? null;
  }

  async all(): Promise<Row[]> {
    return this.applyState(this.rows(), this.state);
  }

  async create(data: Row): Promise<Row> {
    const row: Row = { ...data };
    if (row.id === undefined || row.id === null) row.id = fakeId(this.model);
    for (const f of TIMESTAMP_DEFAULTS) {
      if (row[f] === undefined) row[f] = new Date();
    }
    for (const f of NULLABLE_FIELDS[this.model] ?? []) {
      if (row[f] === undefined) row[f] = null;
    }
    if (!this.db.tables[this.model]) this.db.tables[this.model] = new Map();
    this.db.tables[this.model].set(row.id as string, row);
    return row;
  }

  async update(data: Row): Promise<Row | null> {
    const matches = this.rows().filter((r) => this.state.predicates.every((p) => p(r)));
    if (matches.length === 0) return null;
    for (const row of matches) {
      Object.assign(row, data);
      if ('updatedAt' in row) row.updatedAt = new Date();
    }
    return matches[0];
  }

  async updateAll(data: Row): Promise<Row[]> {
    const matches = this.rows().filter((r) => this.state.predicates.every((p) => p(r)));
    for (const row of matches) {
      Object.assign(row, data);
      if ('updatedAt' in row) row.updatedAt = new Date();
    }
    return matches;
  }

  async delete(): Promise<Row | null> {
    const matches = this.rows().filter((r) => this.state.predicates.every((p) => p(r)));
    if (matches.length === 0) return null;
    for (const row of matches) this.db.tables[this.model].delete(row.id as string);
    return matches[0];
  }

  async deleteAll(): Promise<Row[]> {
    const matches = this.rows().filter((r) => this.state.predicates.every((p) => p(r)));
    for (const row of matches) this.db.tables[this.model].delete(row.id as string);
    return matches;
  }
}

export class FakeDb {
  tables: Record<string, Map<string, Row>> = {};
  orm: { public: Record<string, FakeCollection> };

  constructor() {
    const self = this;
    this.orm = {
      public: new Proxy(
        {},
        {
          get(_target, model: string) {
            return new FakeCollection(self, model);
          },
        },
      ) as Record<string, FakeCollection>,
    };
  }

  /** Seed a table directly (rows are stored as given). Rows without an
   * `id` (e.g. LessonProgress, whose key is composite) are keyed by their
   * JSON content so several such rows do not overwrite each other. */
  seed(model: string, rows: Row[]): void {
    if (!this.tables[model]) this.tables[model] = new Map();
    for (const row of rows) {
      const key = row.id !== undefined && row.id !== null ? (row.id as string) : JSON.stringify(row);
      this.tables[model].set(key, { ...row });
    }
  }

  /** Clear every table (test reset). */
  reset(): void {
    this.tables = {};
  }

  async transaction<T>(cb: (tx: FakeDb) => Promise<T>): Promise<T> {
    // No rollback semantics in the fake — repositories do not use
    // transactions yet. The callback runs against the same tables.
    return cb(this);
  }

  /** The fake, cast to the real client type (test-only seam). */
  asClient(): DbClient {
    return this as unknown as DbClient;
  }
}

/** Build a fresh fake client. */
export function createFakeDb(): FakeDb {
  return new FakeDb();
}
