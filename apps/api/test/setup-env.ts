import { bootstrapEnv } from '@wayrune/config';

process.env.APP_ENV = process.env.APP_ENV || 'local';
bootstrapEnv();
