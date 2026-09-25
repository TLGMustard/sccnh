import { boolean, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const events = pgTable('events', {
  id: text('id').primaryKey(), name: text('name').notNull(), tagline: text('tagline').notNull(), overview: text('overview').notNull(), startDate: text('start_date').notNull(), endDate: text('end_date').notNull(),
});
export const locations = pgTable('locations', {
  id: text('id').primaryKey(), name: text('name').notNull(), shortName: text('short_name').notNull(), blurb: text('blurb').notNull(), walkingNote: text('walking_note').notNull(),
});
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(), name: text('name').notNull(), description: text('description').notNull(), training: text('training').notNull(),
});
export const shifts = pgTable('shifts', {
  id: text('id').primaryKey(), day: text('day').notNull(), locationId: text('location_id').notNull().references(() => locations.id), taskId: text('task_id').notNull().references(() => tasks.id), startsAt: text('starts_at').notNull(), endsAt: text('ends_at').notNull(), capacity: integer('capacity').notNull(), title: text('title'), description: text('description'), isActive: boolean('is_active').notNull().default(true),
}, (table) => [index('idx_shifts_day_start').on(table.day, table.startsAt)]);
export const volunteers = pgTable('volunteers', {
  id: text('id').primaryKey(), email: text('email').notNull(), firstName: text('first_name').notNull(), lastName: text('last_name').notNull(), phone: text('phone').notNull().default(''), wantsSiteLead: boolean('wants_site_lead').notNull().default(false), accessCodeHash: text('access_code_hash').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('uq_volunteers_email').on(table.email)]);
export const signups = pgTable('signups', {
  id: text('id').primaryKey(), volunteerId: text('volunteer_id').notNull().references(() => volunteers.id), shiftId: text('shift_id').notNull().references(() => shifts.id), status: text('status').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('uq_signups_volunteer_shift').on(table.volunteerId, table.shiftId), index('idx_signups_shift_status').on(table.shiftId, table.status)]);
export const trainings = pgTable('trainings', {
  id: text('id').primaryKey(), volunteerId: text('volunteer_id').notNull().references(() => volunteers.id), type: text('type').notNull(), completedAt: text('completed_at').notNull(), completedBy: text('completed_by').notNull(),
}, (table) => [uniqueIndex('uq_trainings_volunteer_type').on(table.volunteerId, table.type)]);
export const seedVersions = pgTable('seed_versions', { version: text('version').primaryKey(), appliedAt: text('applied_at').notNull() });
