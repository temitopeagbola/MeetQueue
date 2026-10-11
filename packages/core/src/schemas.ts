import { z } from 'zod';
import { findRuleProblems } from './slots';
import { MINUTES_PER_DAY, isValidTimeZone } from './time';

/** Paths the web app owns at the top level, so they can't be claimed as public usernames. */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'app',
  'book',
  'booking',
  'dashboard',
  'demo-admin',
  'help',
  'login',
  'logout',
  'manage',
  'settings',
  'signup',
  'static',
  'support',
  '_next',
]);

export const MAX_SLOT_QUERY_DAYS = 62;

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, 'Timezone is required')
  .max(64)
  .refine(isValidTimeZone, 'Unknown timezone');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters')
  .max(32, 'Use at most 32 characters')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'Use lowercase letters, numbers and dashes (not at the start or end)',
  )
  .refine((value) => !RESERVED_USERNAMES.has(value), 'That username is reserved');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Slug is required')
  .max(60)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and dashes');

const nameSchema = z.string().trim().min(1, 'Name is required').max(80);

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  username: usernameSchema,
  password: z.string().min(8, 'Use at least 8 characters').max(128),
  timezone: timezoneSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const availabilityRuleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(MINUTES_PER_DAY - 1),
    endMinute: z.number().int().min(1).max(MINUTES_PER_DAY),
  })
  .refine((rule) => rule.endMinute > rule.startMinute, {
    error: 'End time must be after start time',
    path: ['endMinute'],
  });

export const availabilityUpdateSchema = z
  .object({
    timezone: timezoneSchema,
    rules: z.array(availabilityRuleSchema).max(70),
  })
  .superRefine((value, ctx) => {
    for (const problem of findRuleProblems(value.rules)) {
      ctx.addIssue({ code: 'custom', message: problem, path: ['rules'] });
    }
  });
export type AvailabilityUpdateInput = z.infer<typeof availabilityUpdateSchema>;

export const meetingTypeSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(80),
  slug: slugSchema,
  description: z.string().trim().max(500).nullish(),
  location: z.string().trim().max(200).nullish(),
  durationMinutes: z.number().int().min(5).max(480),
  bufferBeforeMinutes: z.number().int().min(0).max(240),
  bufferAfterMinutes: z.number().int().min(0).max(240),
  slotIntervalMinutes: z.number().int().min(5).max(240),
  minNoticeMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30),
  maxDaysAhead: z.number().int().min(1).max(365),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #4f46e5')
    .default('#4f46e5'),
  isActive: z.boolean().default(true),
});
export type MeetingTypeInput = z.infer<typeof meetingTypeSchema>;
export const meetingTypeUpdateSchema = meetingTypeSchema.partial();
export type MeetingTypeUpdateInput = z.infer<typeof meetingTypeUpdateSchema>;

export const slotsQuerySchema = z
  .object({
    start: z.iso.date(),
    end: z.iso.date(),
    timezone: timezoneSchema,
  })
  .refine((q) => q.end >= q.start, { error: 'end must not be before start', path: ['end'] })
  .refine((q) => (Date.parse(q.end) - Date.parse(q.start)) / 86_400_000 < MAX_SLOT_QUERY_DAYS, {
    error: `Query at most ${MAX_SLOT_QUERY_DAYS} days at a time`,
    path: ['end'],
  });
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export const bookingCreateSchema = z.object({
  start: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: emailSchema,
  timezone: timezoneSchema,
  notes: z.string().trim().max(1000).optional(),
});
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

export const rescheduleSchema = z.object({
  start: z.iso.datetime({ offset: true }),
});

export const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
