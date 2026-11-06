import { readFamilyCalendar } from './family-calendar';
import { readFamilyProfile } from './family-profile';
import { readFamilyLayout } from './family-layout';
import { readFamilyWaste } from './family-waste';
import { readTransitConfig } from './family-transit';
import { readBrain } from './family-brain';

/** Must succeed before serving requests; unknown schemas stop startup, not overwrite data. */
export async function initializeHouseDash(): Promise<void> {
  await readFamilyProfile();
  await readFamilyLayout();
  await readFamilyWaste();
  await readTransitConfig();
  await readBrain();
  await readFamilyCalendar();
}
