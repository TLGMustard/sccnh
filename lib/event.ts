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
  tagline: 'Free bagels. Hard conversations. Three days in January.',
  startDate: '2027-01-25',
  endDate: '2027-01-27',
  overview:
    'Every January, SCCNH sets up across UF, gives away thousands of bagels, and uses the moment to start honest conversations about antisemitism. Pick the place, time, and job that feel right for you.',
  essentials: [
    'Arrive five minutes early and find the shift lead under the blue canopy.',
    'Wear layers and closed-toe shoes. Event shirts are handed out on site.',
    'Most jobs need the 20-minute general training. Set-Up and Clean Up need lead training.',
  ],
};

export const LOCATIONS: LocationInfo[] = [
  {
    id: 'turlington',
    name: 'Turlington Plaza',
    shortName: 'Turlington',
    blurb: 'The busiest table on campus. Best for first-time volunteers who want a steady stream of people and a large team around them.',
    walkingNote: 'Between Turlington Hall and Library West; three minutes from Plaza of the Americas.',
  },
  {
    id: 'plaza',
    name: 'Plaza of the Americas',
    shortName: 'The Plaza',
    blurb: 'A calmer table with room for longer conversations. Many students are already sitting nearby between classes.',
    walkingNote: 'North of Turlington, past Library West; about a three-minute walk.',
  },
  {
    id: 'hpnp',
    name: 'HPNP Courtyard',
    shortName: 'HPNP',
    blurb: 'The health-science campus table. It is quieter than Turlington, which makes each volunteer especially important and each conversation less rushed.',
    walkingNote: 'South of Turlington on Center Drive; about six minutes on foot. Bus 118 if it rains.',
  },
  {
    id: 'hillel',
    name: 'UF Hillel',
    shortName: 'Hillel',
    blurb: 'An indoor assembly line the night before the main event: count, bag, label, and stack roughly two thousand bagels.',
    walkingNote: '2020 W University Ave. Street parking is available on NW 20th after 6 PM.',
  },
  {
    id: 'greek',
    name: 'Greek Chapter Houses',
    shortName: 'Greek houses',
    blurb: 'Small crews visit chapter dinners, give a short SCCNH announcement, and leave a lawn sign. Choose a clearly labeled route below.',
    walkingNote: 'Meet at Hillel at 4:50 PM. Crews leave together at 5:00 PM; wear the event shirt.',
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
  ['Fraternity Row — north', 'AEPi, Sammy, ZBT, Pi Kappa Alpha, Theta Chi, Sigma Nu, and Delta Tau Delta.'],
  ['Fraternity Row — south', 'Beta Theta Pi, Kappa Sigma, Phi Delta Theta, Sigma Chi, Lambda Chi Alpha, and Alpha Tau Omega.'],
  ['Sorority Row — north', 'Alpha Chi Omega, Alpha Delta Pi, Chi Omega, Tri Delta, Delta Gamma, Kappa Alpha Theta, Kappa Delta, and Kappa Kappa Gamma.'],
  ['Sorority Row — south', 'Phi Mu, Pi Beta Phi, Sigma Kappa, Zeta Tau Alpha, AOPi, Delta Zeta, and Gamma Phi Beta.'],
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
