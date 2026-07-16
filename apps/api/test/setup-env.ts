import { bootstrapEnv } from '@travel/config';

process.env.APP_ENV = process.env.APP_ENV || 'local';
bootstrapEnv();
