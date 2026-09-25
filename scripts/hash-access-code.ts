import { hashAccessCode } from '../lib/access-code.ts';

const code = process.argv[2];
if (!code) {
  throw new Error('Pass an access code as the only argument. It must be 12 to 128 characters.');
}

console.log(await hashAccessCode(code));
