import { createContext, useContext } from 'react';
import type { InquiryCreateDefaults } from '../components/inquiries/InquiryCreateSheet';

/**
 * Lets any agency page (Dashboard, Parties, etc.) open the unified Travel
 * Request wizard that lives in the app Shell, optionally prefilled (e.g. with
 * an existing customer's partyId). Falls back to a no-op outside the Shell.
 */
export type TravelRequestLaunchOptions = {
  onCreated?: () => void;
};

export type TravelRequestLauncher = (
  defaults?: InquiryCreateDefaults,
  options?: TravelRequestLaunchOptions,
) => void;

const TravelRequestLauncherContext = createContext<TravelRequestLauncher>(() => {});

export const TravelRequestLauncherProvider = TravelRequestLauncherContext.Provider;

export function useTravelRequestLauncher(): TravelRequestLauncher {
  return useContext(TravelRequestLauncherContext);
}
