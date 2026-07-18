import type { ComponentType } from 'react';
import { AboutPage } from './AboutPage';
import { ContactPage } from './ContactPage';
import { DestinationsPage } from './DestinationsPage';
import { HomePage } from './HomePage';
import { TripsPage } from './TripsPage';

/** Route table for the local preview app. Extend when adding pages in site/structure.json. */
export const appRoutes: Record<string, ComponentType> = {
  '/': HomePage,
  '/destinations': DestinationsPage,
  '/trips': TripsPage,
  '/about': AboutPage,
  '/contact': ContactPage,
};
