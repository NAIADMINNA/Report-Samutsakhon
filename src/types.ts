import { Timestamp } from 'firebase/firestore';

export type RecordStatus = 'completed' | 'pending' | 'cancelled';

export type GroupByDimension =
  | 'sourceSystem'
  | 'category'
  | 'department'
  | 'status'
  | 'recordDate';

export interface ReportRecord {
  id: string;
  ownerId: string;
  sourceSystem: string;
  referenceCode: string;
  title: string;
  category: string;
  department: string;
  amount: number;
  quantity: number;
  status: RecordStatus;
  recordDate: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ReportTemplate {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  sourceSystemFilter: string;
  categoryFilter: string;
  statusFilter: string;
  groupByField: GroupByDimension;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AggregatedRow {
  key: string;
  recordCount: number;
  totalQuantity: number;
  totalAmount: number;
  completedAmount: number;
  pendingAmount: number;
  sharePercent: number;
}

/**
 * Verbatim validation constants synchronized with firebase-blueprint.json
 * and firestore.rules.
 */
export const BLUEPRINT_CONSTRAINTS = {
  ID_MAX_LENGTH: 128,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  RECORD: {
    SOURCE_SYSTEM_MAX: 80,
    REFERENCE_CODE_MAX: 64,
    TITLE_MAX: 160,
    CATEGORY_MAX: 80,
    DEPARTMENT_MAX: 80,
    AMOUNT_MIN: 0,
    AMOUNT_MAX: 1000000000,
    QUANTITY_MIN: 0,
    QUANTITY_MAX: 1000000,
    STATUS_VALUES: ['completed', 'pending', 'cancelled'] as const,
    DATE_PATTERN: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  },
  TEMPLATE: {
    NAME_MAX: 120,
    DESCRIPTION_MAX: 300,
    FILTER_MAX: 80,
    STATUS_FILTER_MAX: 32,
    GROUP_BY_VALUES: [
      'sourceSystem',
      'category',
      'department',
      'status',
      'recordDate',
    ] as const,
  },
};

export function sanitizeString(val: string, maxLength: number, fallback = ''): string {
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}
