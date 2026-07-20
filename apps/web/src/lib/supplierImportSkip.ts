/** Client-side skip reason labels for supplier CSV import. */

export function formatSupplierImportSkipReason(reason: string): string {
  switch (reason) {
    case 'name_exists':
      return 'duplicate name';
    case 'contact_required':
      return 'email or phone required';
    case 'invalid_type':
      return 'unknown supplier type';
    case 'name_required':
      return 'name required';
    default:
      return reason.replace(/_/g, ' ');
  }
}
