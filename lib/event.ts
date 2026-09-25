export type EventInfo = {
  id: string;
  name: string;
  tagline: string;
  startDate: string;
  endDate: string;
  overview: string;
  essentials: string[];
};

export type LocationInfo = {
  id: string;
  name: string;
  shortName: string;
  blurb: string;
  walkingNote: string;
};

export type TaskInfo = {
  id: string;
  name: string;
  description: string;
  training: 'general' | 'lead';
};

export type ShiftSeed = {
  id: string;
  day: string;
  locationId: string;
  taskId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  title?: string;
  description?: string;
};

export const EVENT: EventInfo = {
  id: 'sccnh-2027',
  name: 'Spread Cream Cheese Not Hate',
  tagline: 'Volunteer signup',
  startDate: '2027-01-25',
  endDate: '2027-01-27',
  overview: 'Pick a shift.',
  essentials: [
    'Training is 1.5 hours.',
    'Bring your SCCNH shirt. Event shirts are provided at training.',
    'Interested site leads will be contacted by the VC of Ops.',
  ],
};

export const LOCATIONS: LocationInfo[] = [
  {
    id: 'turlington',
    name: 'Turlington Plaza',
    shortName: 'Turlington',
    blurb: 'Main campus table.',
    walkingNote: 'Between Turlington Hall and Library West.',
  },
  {
    id: 'plaza',
    name: 'Plaza of the Americas',
    shortName: 'The Plaza',
    blurb: 'Campus table.',
    walkingNote: 'North of Turlington, past Library West.',
  },
  {
    id: 'hpnp',
    name: 'HPNP Courtyard',
    shortName: 'HPNP',
    blurb: 'Health-science table.',
    walkingNote: 'South of Turlington on Center Drive.',
  },
  {
    id: 'hillel',
    name: 'UF Hillel',
    shortName: 'Hillel',
    blurb: 'Bagging shift.',
    walkingNote: '2020 W University Ave.',
  },
  {
    id: 'greek',
    name: 'Greek Chapter Houses',
    shortName: 'Greek houses',
    blurb: 'Chapter route.',
    walkingNote: 'Meet at Hillel at 4:50 PM.',
  },
];

export const TASKS: TaskInfo[] = [
  {
    id: 'setup',
    name: 'Set-Up',
    description: 'Unload tables and supplies, raise the canopy, place signs, and prepare the cream-cheese station.',
    training: 'general',
  },
  {
    id: 'tabling',
    name: 'Tabling',
    description: 'Offer bagels, invite a two-minute conversation, listen more than you talk, and collect pledge cards.',
    training: 'general',
  },
  {
    id: 'cleanup',
    name: 'Clean Up',
    description: 'Break down the table, bag trash, and return supplies to Hillel.',
    training: 'general',
  },
  {
    id: 'bagging',
    name: 'Bagel Bagging',
    description: 'Work an indoor assembly line at Hillel: count, bag, label, and stack bagels for the next morning.',
    training: 'general',
  },
  {
    id: 'announcing',
    name: 'Chapter Announcing',
    description: 'Visit chapter dinners, give a thirty-second event announcement, and leave a lawn sign.',
    training: 'general',
  },
];

const offset = '-05:00';

function stamp(day: string, hour: number, minute: number): string {
  return `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`;
}

function shift(
  day: string,
  locationId: string,
  taskId: string,
  hour: number,
  minute: number,
  endHour: number,
  endMinute: number,
  capacity: number,
  extra: Partial<Pick<ShiftSeed, 'title' | 'description'>> = {},
): ShiftSeed {
  const key = `${locationId}-${day.replaceAll('-', '')}-${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
  const suffix = extra.title ? `-${extra.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 20)}` : '';
  return {
    id: `${key}${suffix}`,
    day,
    locationId,
    taskId,
    startsAt: stamp(day, hour, minute),
    endsAt: stamp(day, endHour, endMinute),
    capacity,
    ...extra,
  };
}

const monday = '2027-01-25';
const tuesday = '2027-01-26';
const wednesday = '2027-01-27';

const greekRoutes: Array<[string, string]> = [
  ['Fraternity Row North', 'North route.'],
  ['Fraternity Row South', 'South route.'],
  ['Sorority Row North', 'North route.'],
  ['Sorority Row South', 'South route.'],
  ['Off-campus houses & Midtown', 'Sigma Phi Epsilon, Phi Gamma Delta, Alpha Phi, Delta Sigma Phi, and Sigma Delta Tau. A car is helpful for this route.'],
];

const greek = greekRoutes.map(([title, description]) =>
  shift(monday, 'greek', 'announcing', 17, 0, 18, 0, 5, { title, description }),
);

const bagging = [
  shift(tuesday, 'hillel', 'bagging', 18, 0, 19, 0, 20),
  shift(tuesday, 'hillel', 'bagging', 19, 0, 20, 0, 30),
];

function timedShifts(day: string, locationId: string, startHour: number, endHour: number, minutes: 30 | 60, capacity: number): ShiftSeed[] {
  const count = (endHour - startHour) * (60 / minutes);
  return Array.from({ length: count }, (_, index) => {
    const start = startHour * 60 + index * minutes;
    const end = start + minutes;
    return shift(
      day,
      locationId,
      'tabling',
      Math.floor(start / 60),
      start % 60,
      Math.floor(end / 60),
      end % 60,
      capacity,
    );
  });
}

export const SHIFTS: ShiftSeed[] = [
  ...greek,
  ...bagging,
  shift(wednesday, 'turlington', 'setup', 7, 30, 8, 0, 20),
  ...timedShifts(wednesday, 'turlington', 8, 18, 30, 30),
  shift(wednesday, 'turlington', 'cleanup', 18, 0, 18, 30, 20),
  ...timedShifts(wednesday, 'plaza', 8, 18, 30, 20),
  ...timedShifts(wednesday, 'hpnp', 9, 17, 60, 15),
];
