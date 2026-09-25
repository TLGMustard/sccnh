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
    'General training: 20 minutes.',
    'Set-Up and Clean Up need lead training.',
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
    training: 'lead',
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
    training: 'lead',
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

const turlingtonCaps = [27, 30, 30, 30, 30, 25, 30, 23, 30, 20, 30, 18, 30, 18, 30, 20];
const turlington: ShiftSeed[] = [shift(wednesday, 'turlington', 'setup', 8, 30, 9, 0, 20)];
for (let index = 0; index < turlingtonCaps.length; index += 1) {
  const start = 9 * 60 + index * 30;
  const end = start + 30;
  turlington.push(
    shift(
      wednesday,
      'turlington',
      'tabling',
      Math.floor(start / 60),
      start % 60,
      Math.floor(end / 60),
      end % 60,
      turlingtonCaps[index],
    ),
  );
}
turlington.push(shift(wednesday, 'turlington', 'cleanup', 17, 0, 17, 30, 20));

function halfHours(day: string, locationId: string, startHour: number, count: number, capacity: number): ShiftSeed[] {
  return Array.from({ length: count }, (_, index) => {
    const start = startHour * 60 + index * 30;
    const end = start + 30;
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
  ...turlington,
  ...halfHours(wednesday, 'plaza', 9, 16, 20),
  ...halfHours(wednesday, 'hpnp', 10, 8, 15),
];
