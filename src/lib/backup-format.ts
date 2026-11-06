/** HouseDash writes its own format name and continues to accept earlier backups. */
export const BACKUP_FORMAT = 'housedash-backup';
/** Earlier names of the format: FamilyOS (before the rename) and Home Screens. */
const EARLIER_FORMATS = ['familyos-backup', 'home-screens-backup'];
export const isBackupFormat = (value: unknown) => value === BACKUP_FORMAT || EARLIER_FORMATS.includes(value as string);
