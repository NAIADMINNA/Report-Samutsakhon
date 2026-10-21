/**
 * Utilities for parsing Firestore `reports` documents into the Official
 * Department of Employment (DOE - กรมการจัดหางาน) Executive Summary Report Poster format,
 * supporting Daily / Date-Period (`รอบ/ช่วงวันที่`), Region (`ภูมิภาค`), and Province (`เลือกจังหวัด`) filtering,
 * plus deep non-clobbering numeric extraction and custom field-mapping overrides.
 */

export interface DoeTargetGroupItem {
  id: number;
  title: string;
  subtitle: string;
  isHot?: boolean;
  count: number;
  percent: number;
  matchedField?: string;
  theme: 'blue' | 'purple' | 'indigo' | 'sky' | 'orange' | 'emerald' | 'rose';
}

export type ThaiRegion = 'เฉพาะกิจ (Mobile Unit)';

export const THAI_REGIONS_LIST: ThaiRegion[] = ['เฉพาะกิจ (Mobile Unit)'];

export interface CustomDoeFieldMap {
  reportDate?: string;
  provincialOffice?: string;
  serviceCenterName?: string;
  provinceName?: string;
  totalAppointments?: string;
  completedCards?: string;
  noShowCount?: string;
  wrongDateCount?: string;
  spoiledCards?: string;
  group1?: string;
  group2?: string;
  group3?: string;
  group4?: string;
  group5?: string;
  group6?: string;
  group7?: string;
  group8?: string;
  swapGroup4And5?: boolean;
  reporterName?: string;
  reporterPosition?: string;
  contactPhone?: string;
}

export interface DoePosterReportData {
  docId: string;
  reportDateRaw: string;
  reportDateThai: string;
  reportBadgeText: string;
  departmentEng: string;
  departmentThai: string;
  provincialOffice: string;
  officeSubtitleEng: string;
  headerRightSubtitle: string;
  executivePillText: string;
  reportMainTitle: string;
  serviceCenterName: string;
  provinceName: string;
  cleanProvince: string;
  regionName: ThaiRegion;

  // Primary Queue & 4 KPI Cards
  totalAppointments: number;
  completedCards: number;
  noShowCount: number;
  wrongDateCount: number;
  spoiledCards: number;

  // Computed percentages
  completedPercent: number;
  noShowPercent: number;
  wrongDatePercent: number;
  spoiledPercent: number;
  serviceSuccessRatePercent: number;

  // 8 Target Groups
  groups: DoeTargetGroupItem[];
  totalGroupsSum: number;

  // Reporter Footer
  reporterName: string;
  reporterPosition: string;
  verifiedStatusText: string;
  contactPhone: string;

  // Diagnostic info showing which Firestore keys were matched
  matchedFieldsDebug: Record<string, string>;

  // Optional embedded bitmap image if the document also saved a base64/URL snapshot
  embeddedImageUrl: string | null;
  rawDoc: Record<string, unknown>;
}

export const DEFAULT_DOE_GROUPS_META: Omit<
  DoeTargetGroupItem,
  'count' | 'percent'
>[] = [
  {
    id: 1,
    title: '1. กลุ่มมาตรา 63/2',
    subtitle: 'มติ ครม 11 พฤศจิกายน 2568',
    isHot: true,
    theme: 'blue',
  },
  {
    id: 2,
    title: '2. กลุ่มมาตรา 59 / มาตรา 62',
    subtitle: 'คนต่างด้าวชำนาญงาน BOI ช่างฝีมือ',
    theme: 'purple',
  },
  {
    id: 3,
    title: '3. กลุ่มมาตรา 59 ( MOU )',
    subtitle: 'ขอใหม่ / ต่ออายุ',
    theme: 'blue',
  },
  {
    id: 4,
    title: '4. กลุ่มมาตรา 63/1',
    subtitle: 'บุคคลที่ไม่มีสัญชาติไทย (1) (2) (3) และ (4)',
    theme: 'indigo',
  },
  {
    id: 5,
    title: '5. กลุ่มมาตรา 63/2',
    subtitle: 'มติ ครม.',
    theme: 'sky',
  },
  {
    id: 6,
    title: '6. กลุ่มมาตรา 64',
    subtitle: 'ทำงานไป - กลับ หรือตามฤดูกาล',
    theme: 'orange',
  },
  {
    id: 7,
    title: '7. เปลี่ยนแปลงรายการใบอนุญาต...',
    subtitle: 'เปลี่ยนตำแหน่งงาน / ชื่อ- สกุล',
    theme: 'emerald',
  },
  {
    id: 8,
    title: '8. ใบแทนใบอนุญาตทำงาน',
    subtitle: 'กรณีบัตรชำรุด สูญหาย หรือขอใบแทน',
    theme: 'rose',
  },
];

const THAI_DAYS = [
  'วันอาทิตย์',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
];

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export function normalizeCleanProvince(rawProvince?: string): string {
  if (!rawProvince) return 'สมุทรสาคร';
  const cleaned = String(rawProvince)
    .replace(/^สำนักงานจัดหางานจังหวัด/u, '')
    .replace(/^สำนักงานจัดหางาน/u, '')
    .replace(/^ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ[-\s]*/u, '')
    .replace(/^ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว\s*/u, '')
    .replace(/^จังหวัด/u, '')
    .replace(/^จ\./u, '')
    .trim();
  if (
    !cleaned ||
    cleaned.includes('สมุทรสาคร') ||
    cleaned.includes('มหาชัย') ||
    cleaned.includes('วัดป้อมวิเชียร') ||
    cleaned.includes('สำนักบริหารแรงงานต่างด้าว')
  ) {
    return 'สมุทรสาคร';
  }
  return cleaned;
}

export function inferRegionFromProvince(
  _province?: string,
  _explicitRegion?: string
): ThaiRegion {
  return 'เฉพาะกิจ (Mobile Unit)';
}

/**
 * Formats an ISO date string (e.g. "2026-10-20") or Date into Thai Buddhist Era full date:
 * e.g. "วันอังคารที่ 20 ตุลาคม 2569"
 */
export function formatThaiFullDate(rawInput: unknown): string {
  if (!rawInput) return 'วันอังคารที่ 20 ตุลาคม 2569';
  const str = String(rawInput).trim();
  if (!str) return 'วันอังคารที่ 20 ตุลาคม 2569';

  if (
    str.includes('มกราคม') ||
    str.includes('กุมภาพันธ์') ||
    str.includes('มีนาคม') ||
    str.includes('เมษายน') ||
    str.includes('พฤษภาคม') ||
    str.includes('มิถุนายน') ||
    str.includes('กรกฎาคม') ||
    str.includes('สิงหาคม') ||
    str.includes('กันยายน') ||
    str.includes('ตุลาคม') ||
    str.includes('พฤศจิกายน') ||
    str.includes('ธันวาคม') ||
    str.startsWith('วัน')
  ) {
    return str;
  }

  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const monthIdx = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);

    const gregYear = year > 2400 ? year - 543 : year;
    const buddhistYear = year > 2400 ? year : year + 543;

    const dateObj = new Date(gregYear, monthIdx, day);
    if (!Number.isNaN(dateObj.getTime()) && monthIdx >= 0 && monthIdx < 12) {
      const dayName = THAI_DAYS[dateObj.getDay()];
      const monthName = THAI_MONTHS[monthIdx];
      return `${dayName}ที่ ${day} ${monthName} ${buddhistYear}`;
    }
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const dayName = THAI_DAYS[parsed.getDay()];
    const day = parsed.getDate();
    const monthName = THAI_MONTHS[parsed.getMonth()];
    const buddhistYear =
      parsed.getFullYear() > 2400
        ? parsed.getFullYear()
        : parsed.getFullYear() + 543;
    return `${dayName}ที่ ${day} ${monthName} ${buddhistYear}`;
  }

  return str;
}

/**
 * Safely parses a numeric value from a Firestore field, strictly rejecting
 * nulls, booleans, empty strings, ISO dates, phone numbers, and arrays/objects.
 */
export function parseValidNumber(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
    const normalizedDigits = val.replace(/[๐-๙]/g, (ch) =>
      String(thaiDigits.indexOf(ch))
    );
    const trimmed = normalizedDigits.trim();
    if (!trimmed) return null;
    if (
      trimmed === '-' ||
      trimmed === '—' ||
      trimmed === '–' ||
      trimmed === 'ไม่มี' ||
      trimmed.toLowerCase() === 'none' ||
      trimmed.toLowerCase() === 'n/a'
    ) {
      return 0;
    }
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed)) return null;
    if (/^0\d{1,2}-\d{3}-\d{3,4}/.test(trimmed)) return null;
    if (trimmed.startsWith('data:image/') || trimmed.startsWith('http')) {
      return null;
    }

    const cleaned = trimmed
      .replace(/\([^)]*%[^)]*\)/g, '')
      .replace(/,/g, '')
      .replace(/^(จำนวน|รวม|ยอด|บัตรเสีย|บัตร)\s*/u, '')
      .replace(/\s*(ใบ|คน|คิว|รายการ|ราย|แห่ง|ฉบับ|บัตร|%)\s*$/u, '')
      .trim();

    if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : null;
    }
  }
  return null;
}

/**
 * Recursively flattens a Firestore document up to 4 levels deep WITHOUT clobbering
 * top-level keys when traversing arrays or nested objects.
 */
export function flattenDocumentDeep(
  docObj: Record<string, unknown>,
  prefix = '',
  depth = 0,
  insideArray = false
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  if (!docObj || typeof docObj !== 'object' || depth > 4) return flat;

  Object.entries(docObj).forEach(([k, v]) => {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    flat[fullKey] = v;

    // Only expose unprefixed shorthand at depth 0 or if not already defined at top-level
    if (depth === 0 && !insideArray && flat[k] === undefined) {
      flat[k] = v;
    }

    // If a string field contains a serialized JSON object/array, parse and flatten it too
    if (
      typeof v === 'string' &&
      v.length > 2 &&
      ((v.startsWith('{') && v.endsWith('}')) ||
        (v.startsWith('[') && v.endsWith(']')))
    ) {
      try {
        const parsedJson = JSON.parse(v);
        if (parsedJson && typeof parsedJson === 'object') {
          const subJson = flattenDocumentDeep(
            parsedJson as Record<string, unknown>,
            fullKey,
            depth + 1,
            Array.isArray(parsedJson)
          );
          Object.entries(subJson).forEach(([subK, subV]) => {
            if (flat[subK] === undefined) flat[subK] = subV;
          });
        }
      } catch {
        // Not valid JSON, ignore
      }
    }

    if (Array.isArray(v)) {
      v.forEach((item, idx) => {
        if (typeof item === 'number' || typeof item === 'string') {
          flat[`${fullKey}[${idx}]`] = item;
        } else if (item && typeof item === 'object') {
          const subFlat = flattenDocumentDeep(
            item as Record<string, unknown>,
            `${fullKey}[${idx}]`,
            depth + 1,
            true
          );
          Object.entries(subFlat).forEach(([subK, subV]) => {
            if (flat[subK] === undefined) {
              flat[subK] = subV;
            }
          });
        }
      });
    } else if (v && typeof v === 'object') {
      const subFlat = flattenDocumentDeep(
        v as Record<string, unknown>,
        fullKey,
        depth + 1,
        insideArray
      );
      Object.entries(subFlat).forEach(([subK, subV]) => {
        if (flat[subK] === undefined) {
          flat[subK] = subV;
        }
      });
    }
  });

  return flat;
}

/**
 * Lists all available numeric fields in a document (with sample value) for the Field Mapping UI.
 */
export function listNumericFieldsInDoc(
  rawDoc: Record<string, unknown>
): { key: string; sampleValue: number }[] {
  const flat = flattenDocumentDeep(rawDoc);
  const seenPaths = new Set<string>();
  const result: { key: string; sampleValue: number }[] = [];

  Object.entries(flat).forEach(([k, v]) => {
    if (k === 'id') return;
    const parsed = parseValidNumber(v);
    if (parsed !== null && !seenPaths.has(k)) {
      seenPaths.add(k);
      result.push({ key: k, sampleValue: parsed });
    }
  });

  return result;
}

const GENERIC_VALUE_LEAF_KEYS = new Set([
  'count',
  'cnt',
  'value',
  'val',
  'total',
  'sum',
  'amount',
  'quantity',
  'qty',
  'num',
  'number',
  'data',
  'people',
  'persons',
  'workers',
  'cards',
  'card',
  'queue',
  'queues',
  'permits',
  'permit',
  'items',
  'item',
  'จำนวน',
  'คน',
  'ใบ',
  'คิว',
  'ราย',
  'รายการ',
  'รวม',
  'ยอด',
]);

function getEffectiveSemanticLeafKey(fullKey: string): string {
  const parts = fullKey.split('.');
  const leaf = parts[parts.length - 1] || fullKey;
  if (
    parts.length >= 2 &&
    GENERIC_VALUE_LEAF_KEYS.has(leaf.toLowerCase())
  ) {
    return parts[parts.length - 2] || leaf;
  }
  return leaf;
}

function stripNumericAffixes(normalizedKey: string): string {
  return normalizedKey
    .replace(
      /^(total|count|cnt|num|number|sum|amount|qty|quantity|value|val|จำนวน|รวม|ยอด)+/i,
      ''
    )
    .replace(
      /(count|cnt|total|value|val|amount|qty|quantity|num|number|จำนวน|คน|ใบ|ราย|รายการ|รวม|ยอด)+$/i,
      ''
    );
}

function normalizeRootStem(coreKey: string): string {
  if (!coreKey) return coreKey;
  const s = coreKey.toLowerCase();
  if (
    s === 'spoiled' ||
    s === 'spoilage' ||
    s === 'spolied' ||
    s === 'spoild' ||
    s === 'spolid' ||
    s === 'spoils'
  ) {
    return 'spoil';
  }
  if (
    s === 'damaged' ||
    s === 'damages' ||
    s === 'damaging' ||
    s === 'damged' ||
    s === 'dameged'
  ) {
    return 'damage';
  }
  if (s === 'wasted' || s === 'wastes' || s === 'wasting' || s === 'wastage') {
    return 'waste';
  }
  if (s === 'voided' || s === 'voids') {
    return 'void';
  }
  if (
    s === 'rejected' ||
    s === 'rejects' ||
    s === 'rejection' ||
    s === 'rejections'
  ) {
    return 'reject';
  }
  if (
    s === 'failed' ||
    s === 'fails' ||
    s === 'failing' ||
    s === 'failure' ||
    s === 'failures'
  ) {
    return 'fail';
  }
  if (
    s === 'cancelled' ||
    s === 'canceled' ||
    s === 'cancels' ||
    s === 'cancellation'
  ) {
    return 'cancel';
  }
  if (s === 'reprinted' || s === 'reprints' || s === 'reprinting') {
    return 'reprint';
  }
  if (s === 'corrupted' || s === 'corrupts') {
    return 'corrupt';
  }
  if (s === 'defective' || s === 'defects') {
    return 'defect';
  }
  if (s === 'errors' || s === 'err' || s === 'errs' || s === 'eror') {
    return 'error';
  }
  if (s === 'faulty' || s === 'faults') {
    return 'fault';
  }
  if (s === 'scrapped' || s === 'scraps') {
    return 'scrap';
  }
  if (s === 'misprinted' || s === 'misprints') {
    return 'misprint';
  }
  if (s === 'destroyed' || s === 'destroys') {
    return 'destroy';
  }
  if (s === 'invalids') {
    return 'invalid';
  }
  if (s === 'losses' || s === 'lost') {
    return 'loss';
  }
  if (s === 'broken' || s === 'breaks' || s === 'broke') {
    return 'broken';
  }
  return s;
}

function markKeyAndAliasesUsed(
  matchedKey: string,
  flatDoc: Record<string, unknown>,
  usedKeys: Set<string>
) {
  usedKeys.add(matchedKey);
  const arrMatch = matchedKey.match(/^(.+)\[(\d+)\]$/);
  if (arrMatch) {
    const arrName = arrMatch[1].split('.').pop() || arrMatch[1];
    const idxOneBased = Number(arrMatch[2]) + 1;
    usedKeys.add(`${arrName}_${idxOneBased}`);
  }

  const leaf = matchedKey.split('.').pop() || matchedKey;
  const semanticLeaf = getEffectiveSemanticLeafKey(matchedKey);
  if (
    flatDoc[leaf] === flatDoc[matchedKey] &&
    !GENERIC_VALUE_LEAF_KEYS.has(leaf.toLowerCase())
  ) {
    usedKeys.add(leaf);
  }
  Object.keys(flatDoc).forEach((k) => {
    const kLeaf = k.split('.').pop() || k;
    const kSemantic = getEffectiveSemanticLeafKey(k);
    if (
      !GENERIC_VALUE_LEAF_KEYS.has(leaf.toLowerCase()) &&
      kLeaf === leaf &&
      flatDoc[k] === flatDoc[matchedKey]
    ) {
      usedKeys.add(k);
    } else if (
      semanticLeaf !== leaf &&
      kSemantic === semanticLeaf &&
      kLeaf === leaf &&
      flatDoc[k] === flatDoc[matchedKey]
    ) {
      usedKeys.add(k);
    }
  });
}

/**
 * Searches `flatDoc` for a valid number using candidate keys, matching against `leafKey`,
 * `semanticParentKey` (for `{ group1: { count: 67 } }` structures), affix-stripped `coreKey`,
 * and English root stems (`spoil`/`spoiled`, `damage`/`damaged`, etc.), while preferring
 * non-zero (`> 0`) values if multiple synonymous keys exist in the same document.
 */
function findNumberSmart(
  flatDoc: Record<string, unknown>,
  candidates: string[],
  usedKeys: Set<string>,
  explicitKeyOverride?: string,
  excludeKeyPredicate?: (keyPath: string) => boolean
): { value: number | null; matchedKey: string | null } {
  // 0. Explicit user field mapping override
  if (explicitKeyOverride && explicitKeyOverride in flatDoc) {
    const rawOverride = flatDoc[explicitKeyOverride];
    const parsedDirect = parseValidNumber(rawOverride);
    if (parsedDirect !== null) {
      markKeyAndAliasesUsed(explicitKeyOverride, flatDoc, usedKeys);
      return { value: parsedDirect, matchedKey: explicitKeyOverride };
    }
    if (
      rawOverride &&
      typeof rawOverride === 'object' &&
      !Array.isArray(rawOverride)
    ) {
      const objCount = extractCountFromGroupObject(
        rawOverride as Record<string, unknown>
      );
      if (objCount.count !== null) {
        const subKey = `${explicitKeyOverride}.${objCount.propName || 'count'}`;
        markKeyAndAliasesUsed(subKey, flatDoc, usedKeys);
        return { value: objCount.count, matchedKey: subKey };
      }
    }
  }

  const entries = Object.entries(flatDoc);
  const norm = (s: string) =>
    s.toLowerCase().replace(/[\s_\-.()/]/g, '');

  let zeroFallback: { value: number; matchedKey: string } | null = null;

  const isPercentageOrRateKey = (keyPath: string): boolean => {
    const lk = keyPath.toLowerCase();
    return (
      lk.includes('percent') ||
      lk.includes('pct') ||
      lk.includes('rate') ||
      lk.includes('ratio') ||
      lk.includes('share') ||
      lk.includes('ร้อยละ') ||
      lk.includes('เปอร์เซ็นต์') ||
      lk.includes('%')
    );
  };

  // 1. Exact case-insensitive match on full key, leaf key, or semantic parent key
  for (const cand of candidates) {
    const lowerCand = cand.toLowerCase();
    for (const [k, v] of entries) {
      if (k === 'id' || usedKeys.has(k)) continue;
      if (k.includes('[') && !cand.includes('[')) continue;
      if (isPercentageOrRateKey(k)) continue;
      if (excludeKeyPredicate && excludeKeyPredicate(k)) continue;
      const leafKey = k.split('.').pop() || k;
      const semanticKey = getEffectiveSemanticLeafKey(k);
      if (
        k.toLowerCase() === lowerCand ||
        leafKey.toLowerCase() === lowerCand ||
        semanticKey.toLowerCase() === lowerCand
      ) {
        const parsed = parseValidNumber(v);
        if (parsed !== null && parsed >= 0) {
          markKeyAndAliasesUsed(k, flatDoc, usedKeys);
          return { value: parsed, matchedKey: k };
        }
      }
    }
  }

  // 2. Normalized exact match, affix-stripped `coreKey` match, OR stem-normalized match
  for (const cand of candidates) {
    const normCand = norm(cand);
    const coreCand = stripNumericAffixes(normCand) || normCand;
    const stemCand = normalizeRootStem(coreCand);
    if (!normCand) continue;
    for (const [k, v] of entries) {
      if (k === 'id' || usedKeys.has(k)) continue;
      if (k.includes('[') && !cand.includes('[')) continue;
      if (isPercentageOrRateKey(k)) continue;
      if (excludeKeyPredicate && excludeKeyPredicate(k)) continue;
      const leafKey = k.split('.').pop() || k;
      const semanticKey = getEffectiveSemanticLeafKey(k);
      const normLeaf = norm(leafKey);
      const normSemantic = norm(semanticKey);
      const coreLeaf = stripNumericAffixes(normLeaf);
      const coreSemantic = stripNumericAffixes(normSemantic);
      const stemLeaf = normalizeRootStem(coreLeaf);
      const stemSemantic = normalizeRootStem(coreSemantic);

      if (
        normLeaf === normCand ||
        normSemantic === normCand ||
        norm(k) === normCand ||
        (coreLeaf &&
          (coreLeaf === normCand ||
            coreLeaf === coreCand ||
            (stemLeaf.length >= 4 && stemLeaf === stemCand))) ||
        (coreSemantic &&
          (coreSemantic === normCand ||
            coreSemantic === coreCand ||
            (stemSemantic.length >= 4 && stemSemantic === stemCand)))
      ) {
        const parsed = parseValidNumber(v);
        if (parsed !== null && parsed >= 0) {
          markKeyAndAliasesUsed(k, flatDoc, usedKeys);
          return { value: parsed, matchedKey: k };
        }
      }
    }
  }

  // 3. Normalized substring match on `leafKey`, `semanticKey`, or path segments (for descriptive candidates of length >= 4)
  for (const cand of candidates) {
    const normCand = norm(cand);
    if (normCand.length < 4) continue;
    const lowerCand = cand.toLowerCase();
    for (const [k, v] of entries) {
      if (k === 'id' || usedKeys.has(k)) continue;
      if (k.includes('[')) continue;
      if (isPercentageOrRateKey(k)) continue;
      if (excludeKeyPredicate && excludeKeyPredicate(k)) continue;
      const leafKey = k.split('.').pop() || k;
      const semanticKey = getEffectiveSemanticLeafKey(k);
      const normLeaf = norm(leafKey);
      const normSemantic = norm(semanticKey);
      const normFull = norm(k);
      if (
        leafKey.toLowerCase().includes(lowerCand) ||
        semanticKey.toLowerCase().includes(lowerCand) ||
        k.toLowerCase().includes(lowerCand) ||
        (normCand.length >= 4 &&
          (normLeaf.includes(normCand) ||
            normSemantic.includes(normCand) ||
            normFull.includes(normCand)))
      ) {
        const parsed = parseValidNumber(v);
        if (parsed !== null) {
          if (parsed > 0) {
            markKeyAndAliasesUsed(k, flatDoc, usedKeys);
            return { value: parsed, matchedKey: k };
          }
          if (!zeroFallback) {
            zeroFallback = { value: parsed, matchedKey: k };
          }
        }
      }
    }
  }

  if (zeroFallback) {
    markKeyAndAliasesUsed(zeroFallback.matchedKey, flatDoc, usedKeys);
    return zeroFallback;
  }

  // 4. Also check arrays of KPI objects (e.g. `kpis: [{ label: 'บัตรเสีย', count: 2 }]` or `summary: [...]`)
  for (const [arrKey, arrVal] of entries) {
    if (!Array.isArray(arrVal) || arrVal.length === 0 || arrVal.length > 20)
      continue;
    if (excludeKeyPredicate && excludeKeyPredicate(arrKey)) continue;
    for (let idx = 0; idx < arrVal.length; idx += 1) {
      const item = arrVal[idx];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const itemObj = item as Record<string, unknown>;
      const labelText = [
        itemObj.label,
        itemObj.title,
        itemObj.subtitle,
        itemObj.name,
        itemObj.key,
        itemObj.id,
        itemObj.type,
        itemObj.category,
        itemObj.description,
      ]
        .filter((x) => typeof x === 'string')
        .join(' ')
        .toLowerCase();
      if (!labelText) continue;
      if (excludeKeyPredicate && excludeKeyPredicate(labelText)) continue;

      const normLabel = norm(labelText);
      const isCandMatch = candidates.some((cand) => {
        const lc = cand.toLowerCase();
        const nc = norm(cand);
        return (
          labelText === lc ||
          (lc.length >= 4 && labelText.includes(lc)) ||
          (nc.length >= 4 && normLabel.includes(nc))
        );
      });

      if (isCandMatch) {
        const { count, propName } = extractCountFromGroupObject(itemObj);
        const mKey = `${arrKey}[${idx}].${propName || 'count'}`;
        if (count !== null && !usedKeys.has(mKey)) {
          if (count > 0) {
            markKeyAndAliasesUsed(mKey, flatDoc, usedKeys);
            return { value: count, matchedKey: mKey };
          }
          if (!zeroFallback) {
            zeroFallback = { value: count, matchedKey: mKey };
          }
        }
      }
    }
  }

  if (zeroFallback) {
    markKeyAndAliasesUsed(zeroFallback.matchedKey, flatDoc, usedKeys);
    return zeroFallback;
  }

  return { value: null, matchedKey: null };
}

function findStringByKeys(
  flatDoc: Record<string, unknown>,
  candidates: string[],
  fallback: string,
  explicitKeyOverride?: string
): string {
  if (explicitKeyOverride && typeof flatDoc[explicitKeyOverride] === 'string') {
    const v = String(flatDoc[explicitKeyOverride]).trim();
    if (v) return v;
  }

  const entries = Object.entries(flatDoc);

  for (const cand of candidates) {
    const lowerCand = cand.toLowerCase();
    const matched = entries.find(([k]) => {
      const leaf = k.split('.').pop() || k;
      return (
        k.toLowerCase() === lowerCand || leaf.toLowerCase() === lowerCand
      );
    });
    if (
      matched !== undefined &&
      typeof matched[1] === 'string' &&
      matched[1].trim()
    ) {
      return matched[1].trim();
    }
  }

  for (const cand of candidates) {
    if (cand.length < 3) continue;
    const lowerCand = cand.toLowerCase();
    const matched = entries.find(([k]) => {
      const leaf = k.split('.').pop() || k;
      return leaf.toLowerCase().includes(lowerCand);
    });
    if (
      matched !== undefined &&
      typeof matched[1] === 'string' &&
      matched[1].trim()
    ) {
      return matched[1].trim();
    }
  }

  return fallback;
}

/**
 * Maps a 0-based generic database group slot (0..7) to the Poster Display slot (0..7).
 * Standard 1:1 mapping: index 3 (`group4`) -> slot 3 (Group 4), index 4 (`group5`) -> slot 4 (Group 5).
 */
function mapGenericDbSlotToPosterSlot(dbZeroBasedIdx: number): number {
  return dbZeroBasedIdx;
}

/**
 * Helper to identify which of the 8 DOE groups (0..7) an object or label belongs to.
 * Prioritizes explicit Thai/Section legal keywords (`63/1` vs `63/2`, etc.) BEFORE generic slot numbers (`group4` vs `group5`).
 */
function inferGroupIndexFromLabelOrId(
  labelOrKey: string,
  itemId?: unknown,
  fallbackIdx?: number
): number | null {
  const combined = `${itemId !== undefined && itemId !== null ? String(itemId) : ''} ${labelOrKey}`
    .toLowerCase()
    .trim();
  const s = labelOrKey.toLowerCase().trim();

  // 1. Check explicit Thai / Section keywords FIRST across combined label + subtitle + id
  if (
    combined.includes('11 พ.ย') ||
    combined.includes('11 พฤศจิกายน') ||
    combined.includes('2568') ||
    combined.includes('nov') ||
    combined.includes('63/2_1') ||
    combined.includes('63_2_1') ||
    combined.includes('63_2_a') ||
    combined.includes('hot')
  ) {
    return 0;
  }
  if (
    combined.includes('62') ||
    combined.includes('boi') ||
    combined.includes('ชำนาญ') ||
    combined.includes('ช่างฝีมือ') ||
    combined.includes('skilled')
  ) {
    return 1;
  }
  if (
    combined.includes('mou') ||
    combined.includes('ขอใหม่') ||
    combined.includes('ต่ออายุ') ||
    (combined.includes('59') && !combined.includes('62'))
  ) {
    return 2;
  }
  if (
    combined.includes('63/1') ||
    combined.includes('63_1') ||
    combined.includes('63-1') ||
    combined.includes('63.1') ||
    combined.includes('631') ||
    combined.includes('ไม่มีสัญชาติ') ||
    combined.includes('ไร้สัญชาติ') ||
    combined.includes('stateless') ||
    combined.includes('nonthai') ||
    combined.includes('non_thai') ||
    combined.includes('minority') ||
    (combined.includes('(1)') && combined.includes('(2)'))
  ) {
    return 3;
  }
  if (
    combined.includes('63/2') ||
    combined.includes('63_2') ||
    combined.includes('63-2') ||
    combined.includes('63.2') ||
    combined.includes('632') ||
    combined.includes('มติ ครม') ||
    combined.includes('มติครม')
  ) {
    return 4;
  }
  if (
    combined.includes('64') ||
    combined.includes('ฤดูกาล') ||
    combined.includes('ไป - กลับ') ||
    combined.includes('ไป-กลับ') ||
    combined.includes('ไปกลับ') ||
    combined.includes('seasonal')
  ) {
    return 5;
  }
  if (
    combined.includes('เปลี่ยนแปลง') ||
    combined.includes('เปลี่ยนตำแหน่ง') ||
    combined.includes('เปลี่ยนชื่อ') ||
    combined.includes('change') ||
    combined.includes('modify') ||
    combined.includes('amend')
  ) {
    return 6;
  }
  if (
    combined.includes('ใบแทน') ||
    combined.includes('ในแทน') ||
    combined.includes('ชำรุด') ||
    combined.includes('สูญหาย') ||
    combined.includes('replace') ||
    combined.includes('substitute') ||
    combined.includes('reissue')
  ) {
    return 7;
  }

  // 2. Check explicit numeric id (1..8) or generic key (`group4`, `group5`, etc.)
  if (typeof itemId === 'number' && itemId >= 1 && itemId <= 8) {
    return mapGenericDbSlotToPosterSlot(itemId - 1);
  }
  if (typeof itemId === 'string') {
    const cleanId = itemId.trim();
    if (/^[1-8]$/.test(cleanId)) {
      return mapGenericDbSlotToPosterSlot(Number(cleanId) - 1);
    }
    const idDigit = cleanId.match(
      /^(?:group|g|cat|category|type|item|target|sec|section|m|s|matra|permit|กลุ่มที่|กลุ่ม|ข้อ)[_\-\s]*([1-8])$/i
    );
    if (idDigit) {
      return mapGenericDbSlotToPosterSlot(Number(idDigit[1]) - 1);
    }
  }

  // 3. Check leading number "1." .. "8." or "กลุ่ม 1" .. "กลุ่ม 8"
  const leadingDigit = s.match(
    /^(?:group|g|cat|category|type|item|target|sec|section|m|s|matra|permit|กลุ่มที่|กลุ่ม|ข้อ)?\s*([1-8])(?:\b|\.|\s|_|-|$)/
  );
  if (leadingDigit) {
    return mapGenericDbSlotToPosterSlot(Number(leadingDigit[1]) - 1);
  }

  if (fallbackIdx !== undefined && fallbackIdx >= 0 && fallbackIdx < 8) {
    return mapGenericDbSlotToPosterSlot(fallbackIdx);
  }
  return null;
}

/**
 * Extracts a numeric count from a group object item (e.g., `{ id: 1, title: "...", count: 67 }`).
 */
function extractCountFromGroupObject(itemObj: Record<string, unknown>): {
  count: number | null;
  propName: string | null;
} {
  const priorityProps = [
    'count',
    'value',
    'total',
    'amount',
    'quantity',
    'persons',
    'workers',
    'people',
    'cards',
    'issued',
    'completed',
    'success',
    'num',
    'number',
    'จำนวน',
    'คน',
    'ใบ',
  ];

  for (const prop of priorityProps) {
    const exactVal = itemObj[prop];
    const parsed = parseValidNumber(exactVal);
    if (parsed !== null) {
      return { count: parsed, propName: prop };
    }
    const caseMatch = Object.entries(itemObj).find(
      ([k]) => k.toLowerCase() === prop.toLowerCase()
    );
    if (caseMatch) {
      const p2 = parseValidNumber(caseMatch[1]);
      if (p2 !== null) {
        return { count: p2, propName: caseMatch[0] };
      }
    }
  }

  // Fallback: pick any numeric property that isn't an ID/index/percentage
  const ignoredKeys = new Set([
    'id',
    'no',
    'index',
    'order',
    'seq',
    'groupno',
    'groupid',
    'percent',
    'percentage',
    'pct',
    'share',
    'rate',
  ]);
  for (const [k, v] of Object.entries(itemObj)) {
    if (ignoredKeys.has(k.toLowerCase())) continue;
    const parsed = parseValidNumber(v);
    if (parsed !== null) {
      return { count: parsed, propName: k };
    }
  }

  return { count: null, propName: null };
}

/**
 * Extracts the 8 target group counts from any Firestore document structure
 * (array of objects, array of numbers, nested map, or numbered/named fields).
 */
function extractEightGroupCounts(
  rawDoc: Record<string, unknown>,
  flatDoc: Record<string, unknown>,
  usedKeys: Set<string>,
  customMap?: CustomDoeFieldMap
): { counts: number[]; matchedKeys: (string | null)[] } {
  const counts = [0, 0, 0, 0, 0, 0, 0, 0];
  const matchedKeys: (string | null)[] = [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ];

  const customGroupOverrides = [
    customMap?.group1,
    customMap?.group2,
    customMap?.group3,
    customMap?.group4,
    customMap?.group5,
    customMap?.group6,
    customMap?.group7,
    customMap?.group8,
  ];

  // Strategy 0: Check explicit custom overrides first
  customGroupOverrides.forEach((overrideKey, idx) => {
    if (overrideKey && overrideKey in flatDoc) {
      const parsed = parseValidNumber(flatDoc[overrideKey]);
      if (parsed !== null) {
        counts[idx] = parsed;
        matchedKeys[idx] = overrideKey;
        markKeyAndAliasesUsed(overrideKey, flatDoc, usedKeys);
      }
    }
  });

  // Strategy 0B: Exact `doe-report-system` `categories` collection mapping when document uses the DOE Report System schema
  const isDoeReportSystemSchema =
    'queueAppointment' in rawDoc ||
    'cardsIssued' in rawDoc ||
    'cardsNotIssued' in rawDoc ||
    'customCategoryValues' in rawDoc;

  if (isDoeReportSystemSchema) {
    // Slot 0 (1. กลุ่มมาตรา 63/2 มติ ครม 11 พฤศจิกายน 2568) -> customCategoryValues.cat_1791818621214
    if (matchedKeys[0] === null) {
      const customCats = rawDoc.customCategoryValues;
      if (
        customCats &&
        typeof customCats === 'object' &&
        !Array.isArray(customCats)
      ) {
        const catObj = customCats as Record<string, unknown>;
        if ('cat_1791818621214' in catObj) {
          const v = parseValidNumber(catObj.cat_1791818621214);
          if (v !== null) {
            counts[0] = v;
            matchedKeys[0] = 'customCategoryValues.cat_1791818621214';
            markKeyAndAliasesUsed(
              'customCategoryValues.cat_1791818621214',
              flatDoc,
              usedKeys
            );
          }
        } else {
          const firstEntry = Object.entries(catObj)[0];
          if (firstEntry) {
            const v = parseValidNumber(firstEntry[1]);
            if (v !== null) {
              const fk = `customCategoryValues.${firstEntry[0]}`;
              counts[0] = v;
              matchedKeys[0] = fk;
              markKeyAndAliasesUsed(fk, flatDoc, usedKeys);
            }
          }
        }
      }
    }

    // Exact mapping defined in `doe-report-system` -> `categories` collection:
    // Slot 1 (2. กลุ่มมาตรา 59 / มาตรา 62 BOI ช่างฝีมือ) -> `modifyDetails`
    // Slot 2 (3. กลุ่มมาตรา 59 ( MOU ) ขอใหม่ / ต่ออายุ) -> `section59` (fallback `mouGroup`)
    // Slot 3 (4. กลุ่มมาตรา 63/1 บุคคลที่ไม่มีสัญชาติไทย) -> `section62`
    // Slot 4 (5. กลุ่มมาตรา 63/2 มติ ครม.) -> `section63_1`
    // Slot 5 (6. กลุ่มมาตรา 64 ทำงานไป - กลับ หรือตามฤดูกาล) -> `section63_2`
    // Slot 6 (7. เปลี่ยนแปลงรายการใบอนุญาตทำงาน) -> `section64`
    // Slot 7 (8. ใบแทนใบอนุญาตทำงาน) -> `substituteCard`
    const doeSystemSlotKeys: { slot: number; keys: string[] }[] = [
      { slot: 1, keys: ['modifyDetails'] },
      { slot: 2, keys: ['section59', 'mouGroup'] },
      { slot: 3, keys: ['section62'] },
      { slot: 4, keys: ['section63_1'] },
      { slot: 5, keys: ['section63_2'] },
      { slot: 6, keys: ['section64'] },
      { slot: 7, keys: ['substituteCard'] },
    ];

    doeSystemSlotKeys.forEach(({ slot, keys }) => {
      if (matchedKeys[slot] !== null) return;
      for (const k of keys) {
        if (k in flatDoc && !usedKeys.has(k)) {
          const v = parseValidNumber(flatDoc[k]);
          if (v !== null) {
            if (v > 0 || matchedKeys[slot] === null) {
              counts[slot] = v;
              matchedKeys[slot] = k;
              markKeyAndAliasesUsed(k, flatDoc, usedKeys);
              if (v > 0) break;
            }
          }
        }
      }
    });

    if (customMap?.swapGroup4And5) {
      const tmpCount = counts[3];
      counts[3] = counts[4];
      counts[4] = tmpCount;
      const tmpKey = matchedKeys[3];
      matchedKeys[3] = matchedKeys[4];
      matchedKeys[4] = tmpKey;
    }

    return { counts, matchedKeys };
  }

  // Strategy 1: Inspect any array in the document (e.g. `groups`, `targetGroups`, `categories`, `items`, `workPermitGroups`, etc.)
  for (const [key, val] of Object.entries(flatDoc)) {
    if (!Array.isArray(val) || val.length === 0 || val.length > 16) continue;

    let arrayMatchedCount = 0;
    const isExactEightArray = val.length === 8;

    val.forEach((item, idx) => {
      const directNum = parseValidNumber(item);
      const mappedSlotIdx = mapGenericDbSlotToPosterSlot(idx);
      if (
        directNum !== null &&
        mappedSlotIdx < 8 &&
        matchedKeys[mappedSlotIdx] === null
      ) {
        counts[mappedSlotIdx] = directNum;
        const mKey = `${key}[${idx}]`;
        matchedKeys[mappedSlotIdx] = mKey;
        markKeyAndAliasesUsed(mKey, flatDoc, usedKeys);
        arrayMatchedCount += 1;
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        const itemObj = item as Record<string, unknown>;
        const labelParts = [
          itemObj.title,
          itemObj.subtitle,
          itemObj.subTitle,
          itemObj.sub,
          itemObj.description,
          itemObj.desc,
          itemObj.detail,
          itemObj.name,
          itemObj.label,
          itemObj.groupName,
          itemObj.category,
          itemObj.section,
          itemObj.matra,
          itemObj.key,
          itemObj.code,
        ]
          .filter((p) => typeof p === 'string' || typeof p === 'number')
          .join(' ');

        let targetIdx = inferGroupIndexFromLabelOrId(
          labelParts,
          itemObj.id ?? itemObj.no ?? itemObj.groupNo ?? itemObj.groupId,
          val.length >= 6 && val.length <= 8 ? idx : undefined
        );

        // If this is an 8-element array and the inferred slot is already filled (e.g. two 63/2 groups),
        // use the mapped positional index so no item in the 8-group array is dropped!
        if (
          isExactEightArray &&
          mappedSlotIdx < 8 &&
          (targetIdx === null || matchedKeys[targetIdx] !== null) &&
          matchedKeys[mappedSlotIdx] === null
        ) {
          targetIdx = mappedSlotIdx;
        }

        if (
          targetIdx !== null &&
          targetIdx >= 0 &&
          targetIdx < 8 &&
          matchedKeys[targetIdx] === null
        ) {
          const { count, propName } = extractCountFromGroupObject(itemObj);
          if (count !== null) {
            counts[targetIdx] = count;
            const mKey = `${key}[${idx}].${propName || 'count'}`;
            matchedKeys[targetIdx] = mKey;
            markKeyAndAliasesUsed(mKey, flatDoc, usedKeys);
            arrayMatchedCount += 1;
          }
        }
      }
    });

    if (arrayMatchedCount >= 2) {
      break;
    }
  }

  // Strategy 2: Specific candidate keys for each of the 8 DOE groups
  // Explicit legal/section keys (`sec63_1`, `sec63_2`, etc.) are listed FIRST, followed by standard numbered keys (`group1`..`group8`).
  const groupKeyCandidates: string[][] = [
    // Group 1 (idx 0): 1. กลุ่มมาตรา 63/2 (มติ ครม 11 พฤศจิกายน 2568)
    [
      'sec63_2_nov',
      'section63_2_nov',
      'sec63_2_11nov',
      'section63_2_11nov',
      'sec63_2_2568',
      'section63_2_2568',
      'sec63_2_1',
      'section63_2_1',
      'sec63_2a',
      'section63_2a',
      'sec63_2_hot',
      'section63_2_hot',
      'sec63_2_new',
      'section63_2_new',
      'm63_2_1',
      'm63_2_nov',
      'm63_2_2568',
      'm63_2_hot',
      's63_2_1',
      's63_2_nov',
      's63_2_2568',
      'group63_2_1',
      'group63_2_nov',
      'matra63_2_1',
      'matra63_2_nov',
      'article63_2_1',
      'article63_2_nov',
      '63_2_1',
      '63_2_nov',
      '63_2_2568',
      '63/2_1',
      'nov11',
      '11nov',
      'cab11nov',
      'cabinet11nov',
      'hotGroup',
      '11 พฤศจิกายน',
      '11 พ.ย.',
      'มาตรา 63/2 มติ ครม 11',
      '1. กลุ่มมาตรา 63/2',
      'group1',
      'group_1',
      'g1',
      'g_1',
      'cat1',
      'cat_1',
      'category1',
      'category_1',
      'type1',
      'type_1',
      'item1',
      'item_1',
      'target1',
      'target_1',
      'targetGroup1',
      'target_group_1',
      'groupCount1',
      'group_count_1',
      'count1',
      'count_1',
      'm1',
      'm_1',
      'matra1',
      's1',
      's_1',
      'sec1',
      'sec_1',
      'section1',
      'section_1',
      'permit1',
      'workPermit1',
      'กลุ่มที่ 1',
      'กลุ่ม 1',
    ],
    // Group 2 (idx 1): 2. กลุ่มมาตรา 59 / มาตรา 62 (BOI ช่างฝีมือ)
    [
      'sec59_62',
      'section59_62',
      'm59_62',
      's59_62',
      'group59_62',
      'matra59_62',
      'article59_62',
      '59_62',
      '59/62',
      '5962',
      'sec62',
      'section62',
      'm62',
      's62',
      'group62',
      'matra62',
      'article62',
      'sec59_boi',
      'section59_boi',
      'm59_boi',
      'sec59_1',
      'section59_1',
      'm59_1',
      'boi',
      'skilled',
      'skilledWorker',
      'skilledWorkers',
      '2. กลุ่มมาตรา 59',
      'มาตรา 59 / มาตรา 62',
      'มาตรา 59/62',
      'มาตรา 62',
      'ชำนาญงาน',
      'ช่างฝีมือ',
      'group2',
      'group_2',
      'g2',
      'g_2',
      'cat2',
      'cat_2',
      'category2',
      'category_2',
      'type2',
      'type_2',
      'item2',
      'item_2',
      'target2',
      'target_2',
      'targetGroup2',
      'target_group_2',
      'groupCount2',
      'group_count_2',
      'count2',
      'count_2',
      'm2',
      'm_2',
      'matra2',
      's2',
      's_2',
      'sec2',
      'sec_2',
      'section2',
      'section_2',
      'permit2',
      'workPermit2',
      'กลุ่มที่ 2',
      'กลุ่ม 2',
    ],
    // Group 3 (idx 2): 3. กลุ่มมาตรา 59 (MOU)
    [
      'sec59_mou',
      'section59_mou',
      'm59_mou',
      's59_mou',
      'group59_mou',
      'matra59_mou',
      'article59_mou',
      '59_mou',
      '59mou',
      'mou59',
      'mou',
      'sec59_2',
      'section59_2',
      'm59_2',
      'sec59',
      'section59',
      'm59',
      's59',
      'group59',
      'matra59',
      'article59',
      '3. กลุ่มมาตรา 59',
      'มาตรา 59 ( MOU )',
      'มาตรา 59 (MOU)',
      'ขอใหม่ / ต่ออายุ',
      'ขอใหม่ต่ออายุ',
      'group3',
      'group_3',
      'g3',
      'g_3',
      'cat3',
      'cat_3',
      'category3',
      'category_3',
      'type3',
      'type_3',
      'item3',
      'item_3',
      'target3',
      'target_3',
      'targetGroup3',
      'target_group_3',
      'groupCount3',
      'group_count_3',
      'count3',
      'count_3',
      'm3',
      'm_3',
      'matra3',
      's3',
      's_3',
      'sec3',
      'sec_3',
      'section3',
      'section_3',
      'permit3',
      'workPermit3',
      'กลุ่มที่ 3',
      'กลุ่ม 3',
    ],
    // Group 4 (idx 3): 4. กลุ่มมาตรา 63/1 (บุคคลที่ไม่มีสัญชาติไทย)
    [
      'sec63_1',
      'section63_1',
      'm63_1',
      's63_1',
      'group63_1',
      'matra63_1',
      'article63_1',
      '63_1',
      '63/1',
      '63-1',
      '63.1',
      '631',
      'stateless',
      'nonThai',
      'non_thai',
      'minority',
      '4. กลุ่มมาตรา 63/1',
      'กลุ่มมาตรา 63/1',
      'มาตรา 63/1',
      'ไม่มีสัญชาติไทย',
      'บุคคลที่ไม่มีสัญชาติไทย',
      'group4',
      'group_4',
      'g4',
      'g_4',
      'cat4',
      'cat_4',
      'category4',
      'category_4',
      'type4',
      'type_4',
      'item4',
      'item_4',
      'target4',
      'target_4',
      'targetGroup4',
      'target_group_4',
      'groupCount4',
      'group_count_4',
      'count4',
      'count_4',
      'm4',
      'm_4',
      'matra4',
      's4',
      's_4',
      'sec4',
      'sec_4',
      'section4',
      'section_4',
      'permit4',
      'workPermit4',
      'กลุ่มที่ 4',
      'กลุ่ม 4',
    ],
    // Group 5 (idx 4): 5. กลุ่มมาตรา 63/2 (มติ ครม.)
    [
      'sec63_2_2',
      'section63_2_2',
      'm63_2_2',
      's63_2_2',
      'group63_2_2',
      'matra63_2_2',
      'sec63_2_5',
      'section63_2_5',
      'm63_2_5',
      's63_2_5',
      'sec63_2b',
      'section63_2b',
      'm63_2b',
      'sec63_2_cab',
      'section63_2_cab',
      'm63_2_cab',
      's63_2_cab',
      'group63_2_cab',
      'sec63_2_cabinet',
      'section63_2_cabinet',
      'm63_2_cabinet',
      'sec63_2_old',
      'section63_2_old',
      'm63_2_old',
      'sec63_2_general',
      'section63_2_general',
      '63_2_2',
      '63_2_5',
      '63_2_cab',
      'sec63_2',
      'section63_2',
      'm63_2',
      's63_2',
      'group63_2',
      'matra63_2',
      'article63_2',
      '63_2',
      '63/2',
      '63-2',
      '63.2',
      '632',
      '5. กลุ่มมาตรา 63/2',
      'มาตรา 63/2 มติ ครม.',
      'มาตรา 63/2 (มติ ครม.)',
      'มาตรา 63/2',
      'group5',
      'group_5',
      'g5',
      'g_5',
      'cat5',
      'cat_5',
      'category5',
      'category_5',
      'type5',
      'type_5',
      'item5',
      'item_5',
      'target5',
      'target_5',
      'targetGroup5',
      'target_group_5',
      'groupCount5',
      'group_count_5',
      'count5',
      'count_5',
      'm5',
      'm_5',
      'matra5',
      's5',
      's_5',
      'sec5',
      'sec_5',
      'section5',
      'section_5',
      'permit5',
      'workPermit5',
      'กลุ่มที่ 5',
      'กลุ่ม 5',
    ],
    // Group 6 (idx 5): 6. กลุ่มมาตรา 64 (ทำงานไป-กลับ หรือตามฤดูกาล)
    [
      'sec64',
      'section64',
      'm64',
      's64',
      'group64',
      'matra64',
      'article64',
      '64',
      'seasonal',
      'border',
      'commute',
      '6. กลุ่มมาตรา 64',
      'มาตรา 64',
      'ตามฤดูกาล',
      'ทำงานไป - กลับ',
      'ทำงานไป-กลับ',
      'group6',
      'group_6',
      'g6',
      'g_6',
      'cat6',
      'cat_6',
      'category6',
      'category_6',
      'type6',
      'type_6',
      'item6',
      'item_6',
      'target6',
      'target_6',
      'targetGroup6',
      'target_group_6',
      'groupCount6',
      'group_count_6',
      'count6',
      'count_6',
      'm6',
      'm_6',
      'matra6',
      's6',
      's_6',
      'sec6',
      'sec_6',
      'section6',
      'section_6',
      'permit6',
      'workPermit6',
      'กลุ่มที่ 6',
      'กลุ่ม 6',
    ],
    // Group 7 (idx 6): 7. เปลี่ยนแปลงรายการใบอนุญาตทำงาน
    [
      'changePermit',
      'change_permit',
      'permitChange',
      'workPermitChange',
      'changeItem',
      'change_item',
      'changeItems',
      'changeInfo',
      'changeDetails',
      'changeDetail',
      'changePosition',
      'changeName',
      'modifyPermit',
      'modify_permit',
      'change',
      'modify',
      'amendment',
      'amend',
      'editPermit',
      'updatePermit',
      '7. เปลี่ยนแปลงรายการ',
      'เปลี่ยนแปลงรายการ',
      'เปลี่ยนตำแหน่งงาน',
      'group7',
      'group_7',
      'g7',
      'g_7',
      'cat7',
      'cat_7',
      'category7',
      'category_7',
      'type7',
      'type_7',
      'item7',
      'item_7',
      'target7',
      'target_7',
      'targetGroup7',
      'target_group_7',
      'groupCount7',
      'group_count_7',
      'count7',
      'count_7',
      'm7',
      'm_7',
      'matra7',
      's7',
      's_7',
      'sec7',
      'sec_7',
      'section7',
      'section_7',
      'permit7',
      'workPermit7',
      'กลุ่มที่ 7',
      'กลุ่ม 7',
    ],
    // Group 8 (idx 7): 8. ใบแทนใบอนุญาตทำงาน (ชำรุด สูญหาย)
    [
      'replacePermit',
      'replace_permit',
      'permitReplace',
      'replacementPermit',
      'permitReplacement',
      'workPermitReplacement',
      'substitutePermit',
      'substitute_permit',
      'substitute',
      'lostCard',
      'lostPermit',
      'replacementCard',
      'cardReplacement',
      'replacement',
      'replace',
      'reissue',
      'duplicatePermit',
      '8. ใบแทนใบอนุญาตทำงาน',
      'ใบแทนใบอนุญาต',
      'ใบแทน',
      'ในแทน',
      'ขอใบแทน',
      'สูญหาย',
      'group8',
      'group_8',
      'g8',
      'g_8',
      'cat8',
      'cat_8',
      'category8',
      'category_8',
      'type8',
      'type_8',
      'item8',
      'item_8',
      'target8',
      'target_8',
      'targetGroup8',
      'target_group_8',
      'groupCount8',
      'group_count_8',
      'count8',
      'count_8',
      'm8',
      'm_8',
      'matra8',
      's8',
      's_8',
      'sec8',
      'sec_8',
      'section8',
      'section_8',
      'permit8',
      'workPermit8',
      'กลุ่มที่ 8',
      'กลุ่ม 8',
    ],
  ];

  // Match disambiguated group keys in priority order
  const priorityOrder = [0, 3, 4, 1, 2, 5, 6, 7];
  priorityOrder.forEach((idx) => {
    if (matchedKeys[idx] !== null) return;
    const cands = groupKeyCandidates[idx];
    const res = findNumberSmart(
      flatDoc,
      cands,
      usedKeys,
      customGroupOverrides[idx]
    );
    if (res.value !== null) {
      counts[idx] = res.value;
      matchedKeys[idx] = res.matchedKey;
    }
  });

  // Strategy 2B: Resolve ambiguous generic `63/2` keys (`sec63_2`, `section63_2`, `m63_2`, `s63_2`, `group63_2`, `matra63_2`, `63_2`, `63/2`)
  // between Group 1 (`idx = 0`) and Group 5 (`idx = 4`) so neither slot is left empty if a generic `63/2` key exists!
  const generic63_2Candidates = [
    'sec63_2',
    'section63_2',
    'm63_2',
    's63_2',
    'group63_2',
    'matra63_2',
    'article63_2',
    '63_2',
    '63/2',
    '632',
    'cabinet',
    'มาตรา 63/2 มติ ครม',
    'กลุ่มมาตรา 63/2',
    'มาตรา 63/2',
  ];
  if (matchedKeys[0] !== null && matchedKeys[4] === null) {
    const res5 = findNumberSmart(flatDoc, generic63_2Candidates, usedKeys);
    if (res5.value !== null) {
      counts[4] = res5.value;
      matchedKeys[4] = res5.matchedKey;
    }
  } else if (matchedKeys[0] === null && matchedKeys[4] !== null) {
    const res1 = findNumberSmart(flatDoc, generic63_2Candidates, usedKeys);
    if (res1.value !== null) {
      counts[0] = res1.value;
      matchedKeys[0] = res1.matchedKey;
    }
  } else if (matchedKeys[0] === null && matchedKeys[4] === null) {
    const resFirst = findNumberSmart(flatDoc, generic63_2Candidates, usedKeys);
    if (resFirst.value !== null) {
      const resSecond = findNumberSmart(flatDoc, generic63_2Candidates, usedKeys);
      if (resSecond.value !== null) {
        counts[0] = resFirst.value;
        matchedKeys[0] = resFirst.matchedKey;
        counts[4] = resSecond.value;
        matchedKeys[4] = resSecond.matchedKey;
      } else {
        counts[4] = resFirst.value;
        matchedKeys[4] = resFirst.matchedKey;
      }
    }
  }

  // Strategy 3: Check any nested map object at depth 1 or depth 2 (`groups`, `targetGroups`, `categories`, `groupCounts`, `workPermit`, `breakdown`)
  const inspectNestedGroupMap = (prefix: string, mapObj: Record<string, unknown>) => {
    const entries = Object.entries(mapObj);
    const numericEntries: { k: string; val: number; fullPath: string }[] = [];

    entries.forEach(([k, v]) => {
      const direct = parseValidNumber(v);
      if (direct !== null) {
        numericEntries.push({ k, val: direct, fullPath: `${prefix}.${k}` });
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const subObj = v as Record<string, unknown>;
        const { count, propName } = extractCountFromGroupObject(subObj);
        if (count !== null) {
          const extraLabel = [subObj.title, subObj.subtitle, subObj.name, subObj.label]
            .filter(Boolean)
            .join(' ');
          numericEntries.push({
            k: `${k} ${extraLabel}`.trim(),
            val: count,
            fullPath: `${prefix}.${k}.${propName || 'count'}`,
          });
        }
      }
    });

    numericEntries.forEach(({ k, val, fullPath }) => {
      if (usedKeys.has(fullPath)) return;
      const idx = inferGroupIndexFromLabelOrId(k);
      if (idx !== null && idx >= 0 && idx < 8 && matchedKeys[idx] === null) {
        counts[idx] = val;
        matchedKeys[idx] = fullPath;
        markKeyAndAliasesUsed(fullPath, flatDoc, usedKeys);
      }
    });

    // If this nested object has 6..8 numeric entries (clearly the 8 target groups map),
    // fill any still-unmatched group slots positionally!
    if (numericEntries.length >= 6 && numericEntries.length <= 8) {
      numericEntries.forEach(({ val, fullPath }, idx) => {
        const mappedSlot = mapGenericDbSlotToPosterSlot(idx);
        if (mappedSlot < 8 && matchedKeys[mappedSlot] === null && !usedKeys.has(fullPath)) {
          counts[mappedSlot] = val;
          matchedKeys[mappedSlot] = fullPath;
          markKeyAndAliasesUsed(fullPath, flatDoc, usedKeys);
        }
      });
    }
  };

  for (const [topKey, topVal] of Object.entries(rawDoc)) {
    if (topVal && typeof topVal === 'object' && !Array.isArray(topVal)) {
      const topObj = topVal as Record<string, unknown>;
      inspectNestedGroupMap(topKey, topObj);
      for (const [subKey, subVal] of Object.entries(topObj)) {
        if (subVal && typeof subVal === 'object' && !Array.isArray(subVal)) {
          inspectNestedGroupMap(`${topKey}.${subKey}`, subVal as Record<string, unknown>);
        }
      }
    }
  }

  // Optional manual swap if configured via CustomDoeFieldMap
  if (customMap?.swapGroup4And5) {
    const tmpCount = counts[3];
    counts[3] = counts[4];
    counts[4] = tmpCount;

    const tmpKey = matchedKeys[3];
    matchedKeys[3] = matchedKeys[4];
    matchedKeys[4] = tmpKey;
  }

  return { counts, matchedKeys };
}

/**
 * Converts any Firestore document from `reports` into a complete `DoePosterReportData` object.
 */
export function mapFirestoreDocToDoePoster(
  rawDoc: Record<string, unknown>,
  embeddedImageUrl: string | null = null,
  customMap?: CustomDoeFieldMap
): DoePosterReportData {
  const flat = flattenDocumentDeep(rawDoc);
  const docId = String(rawDoc.id || 'DOE-REPORT');
  const usedKeys = new Set<string>();
  const matchedFieldsDebug: Record<string, string> = {};

  const reportDateRaw = findStringByKeys(
    flat,
    [
      'reportDate',
      'recordDate',
      'date',
      'workDate',
      'serviceDate',
      'วันที่',
      'วันที่รายงาน',
      'createdAt',
    ],
    '2026-10-20',
    customMap?.reportDate
  );
  const reportDateThai = formatThaiFullDate(reportDateRaw);

  const rawProvinceField = findStringByKeys(
    flat,
    ['provinceName', 'province', 'จังหวัด'],
    '',
    customMap?.provinceName
  );

  const provincialOffice = findStringByKeys(
    flat,
    [
      'provincialOffice',
      'officeName',
      'office',
      'agencyName',
      'department',
      'organization',
      'สำนักงานจัดหางานจังหวัด',
      'สำนักงาน',
    ],
    rawProvinceField
      ? `สำนักงานจัดหางานจังหวัด${normalizeCleanProvince(rawProvinceField)}`
      : 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    customMap?.provincialOffice
  );

  const cleanProvince = normalizeCleanProvince(
    rawProvinceField || provincialOffice
  );
  const provinceName = cleanProvince.startsWith('กรุงเทพ')
    ? cleanProvince
    : `จังหวัด${cleanProvince}`;

  const regionName = inferRegionFromProvince(cleanProvince);

  const serviceCenterName = findStringByKeys(
    flat,
    [
      'serviceCenterName',
      'serviceCenter',
      'centerName',
      'center',
      'locationName',
      'location',
      'branch',
      'venue',
      'place',
      'ศูนย์บริการ',
      'สถานที่',
    ],
    'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว เฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง',
    customMap?.serviceCenterName
  );

  const reportMainTitle = findStringByKeys(
    flat,
    ['reportTitle', 'mainTitle', 'title', 'subject', 'headline'],
    'รายงานผลการปฏิบัติงานศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว'
  );

  const isSpoiledCardKey = (keyPath: string): boolean => {
    const lk = keyPath.toLowerCase();
    // Do not treat Group 8 (ใบแทนใบอนุญาตทำงาน กรณีบัตรชำรุด สูญหาย) as spoiled cards
    if (
      lk.includes('ใบแทน') ||
      lk.includes('สูญหาย') ||
      lk.includes('replace') ||
      lk.includes('substitute') ||
      lk.includes('group8') ||
      lk.includes('group_8') ||
      lk.includes('g8') ||
      lk.includes('8.')
    ) {
      return false;
    }
    return (
      lk.includes('cardsnotissued') ||
      lk.includes('cards_not_issued') ||
      lk.includes('cardnotissued') ||
      lk.includes('card_not_issued') ||
      lk.includes('notissued') ||
      lk.includes('not_issued') ||
      lk.includes('spoil') ||
      lk.includes('spolied') ||
      lk.includes('spoild') ||
      lk.includes('spolid') ||
      lk.includes('บัตรเสีย') ||
      lk.includes('ใบเสีย') ||
      lk.includes('พิมพ์เสีย') ||
      lk.includes('ปริ้นเสีย') ||
      lk.includes('พิมพ์ผิด') ||
      lk.includes('บัตรพัง') ||
      lk.includes('batsia') ||
      lk.includes('bat_sia') ||
      lk.includes('butsia') ||
      lk.includes('but_sia') ||
      lk.includes('cardsia') ||
      lk.includes('card_sia') ||
      lk.includes('badcard') ||
      lk.includes('bad_card') ||
      lk.includes('errorcard') ||
      lk.includes('error_card') ||
      lk.includes('carderror') ||
      lk.includes('card_error') ||
      lk.includes('defectcard') ||
      lk.includes('defectivecard') ||
      lk.includes('wastecard') ||
      lk.includes('wastedcard') ||
      lk.includes('voidcard') ||
      lk.includes('voidedcard') ||
      lk.includes('brokencard') ||
      lk.includes('reprintcard') ||
      lk.includes('reprintedcard') ||
      lk.includes('misprintcard') ||
      lk.includes('misprintedcard') ||
      lk.includes('damagedcard') ||
      lk.includes('damaged_card') ||
      lk.includes('damagecard') ||
      lk.includes('damage_card') ||
      lk.includes('carddamaged') ||
      lk.includes('card_damaged')
    );
  };

  const isExcludedFromSpoiledCards = (keyPath: string): boolean => {
    const lk = keyPath.toLowerCase();
    // Never exclude if the key is explicitly a spoiled-card key (such as `cardsNotIssued`)
    if (isSpoiledCardKey(lk)) {
      return false;
    }
    return (
      lk.includes('noshow') ||
      lk.includes('no_show') ||
      lk.includes('absent') ||
      lk.includes('missed') ||
      lk.includes('ไม่มา') ||
      lk.includes('ขาดนัด') ||
      lk.includes('wrong') ||
      lk.includes('walkin') ||
      lk.includes('walk_in') ||
      lk.includes('late') ||
      lk.includes('ไม่ตรง') ||
      lk.includes('ผิดวัน') ||
      lk.includes('นอกคิว') ||
      lk.includes('appointment') ||
      lk.includes('นัดหมาย') ||
      lk.includes('queue') ||
      lk.includes('คิว') ||
      lk.includes('completed') ||
      lk.includes('issued') ||
      lk.includes('issue') ||
      lk.includes('success') ||
      lk.includes('สำเร็จ') ||
      lk.includes('บัตรดี') ||
      lk.includes('totalcard') ||
      lk.includes('cardtotal') ||
      lk.includes('cardcount') ||
      lk.includes('cardscount') ||
      lk.includes('printedcard') ||
      lk.includes('cardsprinted') ||
      lk.includes('ใบแทน') ||
      lk.includes('สูญหาย') ||
      lk.includes('เปลี่ยนแปลง') ||
      lk.includes('มาตรา') ||
      lk.includes('63/1') ||
      lk.includes('63/2') ||
      lk.includes('63_1') ||
      lk.includes('63_2') ||
      lk.includes('mou') ||
      lk.includes('boi') ||
      lk.includes('group') ||
      lk.includes('กลุ่ม') ||
      lk.includes('replace') ||
      lk.includes('substitute') ||
      lk.includes('lost') ||
      lk.includes('default')
    );
  };

  const isExcludedFromAppointments = (keyPath: string): boolean => {
    const lk = keyPath.toLowerCase();
    if (isSpoiledCardKey(lk)) return true;
    return (
      lk.includes('missed') ||
      lk.includes('noshow') ||
      lk.includes('no_show') ||
      lk.includes('absent') ||
      lk.includes('wrong') ||
      lk.includes('walkin') ||
      lk.includes('walk_in') ||
      lk.includes('late') ||
      lk.includes('mismatch') ||
      lk.includes('reschedule') ||
      lk.includes('offschedule') ||
      lk.includes('outofschedule') ||
      lk.includes('unscheduled') ||
      lk.includes('issued') ||
      lk.includes('completed') ||
      lk.includes('verified') ||
      lk.includes('cumulative') ||
      lk.includes('ไม่มา') ||
      lk.includes('ขาดนัด') ||
      lk.includes('ผิดวัน') ||
      lk.includes('ไม่ตรง') ||
      lk.includes('นอกคิว')
    );
  };

  const SPOILED_CARD_CANDIDATES = [
    'cardsNotIssued',
    'cards_not_issued',
    'cardNotIssued',
    'card_not_issued',
    'notIssuedCards',
    'notIssuedCard',
    'notIssued',
    'บัตรเสีย',
    'จำนวนบัตรเสีย',
    'ยอดบัตรเสีย',
    'รวมบัตรเสีย',
    'บัตรเสียรวม',
    'บัตรพิมพ์เสีย',
    'พิมพ์บัตรเสีย',
    'พิมพ์เสีย',
    'ปริ้นเสีย',
    'บัตรปริ้นเสีย',
    'บัตรพิมพ์ผิด',
    'บัตรเสีย/ชำรุด',
    'บัตรชำรุด/เสีย',
    'บัตรเสียหาย',
    'บัตรผิดพลาด',
    'บัตรพัง',
    'บัตรชำรุด',
    'ใบเสีย',
    'spoiledCards',
    'spoiled_cards',
    'spoiledCard',
    'spoiled_card',
    'spoiledCount',
    'spoiled_count',
    'spoiledCardCount',
    'spoiledCardsCount',
    'cardSpoiled',
    'cardsSpoiled',
    'card_spoiled',
    'cards_spoiled',
    'spoiled',
    'spoilCards',
    'spoil_cards',
    'spoilCard',
    'spoil_card',
    'spoilCount',
    'spoil_count',
    'cardSpoil',
    'cardsSpoil',
    'card_spoil',
    'cards_spoil',
    'spoil',
    'spoliedCards',
    'spoliedCard',
    'spolied',
    'spoildCards',
    'spoildCard',
    'spoild',
    'spolidCards',
    'spolidCard',
    'spoilage',
    'damagedCards',
    'damaged_cards',
    'damagedCard',
    'damaged_card',
    'damagedCount',
    'damaged_count',
    'cardDamaged',
    'cardsDamaged',
    'card_damaged',
    'cards_damaged',
    'damaged',
    'damageCards',
    'damage_cards',
    'damageCard',
    'damage_card',
    'damageCount',
    'damage_count',
    'cardDamage',
    'cardsDamage',
    'card_damage',
    'cards_damage',
    'badCards',
    'bad_cards',
    'badCard',
    'bad_card',
    'badCount',
    'bad_count',
    'cardBad',
    'cardsBad',
    'card_bad',
    'defectiveCards',
    'defectiveCard',
    'defectiveCount',
    'defectCards',
    'defectCard',
    'defectCount',
    'cardDefect',
    'cardsDefect',
    'cardDefective',
    'errorCards',
    'error_cards',
    'errorCard',
    'error_card',
    'errorCount',
    'cardError',
    'cardsError',
    'card_error',
    'errCards',
    'errCard',
    'cardErr',
    'printError',
    'printErrors',
    'printingError',
    'printingErrors',
    'failedCards',
    'failedCard',
    'failCards',
    'failCard',
    'cardFailed',
    'cardsFailed',
    'cardFail',
    'cardsFail',
    'printFailed',
    'printFail',
    'failedPrint',
    'failPrint',
    'voidedCards',
    'voidedCard',
    'voidedCount',
    'voidCards',
    'voidCard',
    'voidCount',
    'cardVoid',
    'cardVoided',
    'wastedCards',
    'wastedCard',
    'wastedCount',
    'wasteCards',
    'wasteCard',
    'wasteCount',
    'cardWaste',
    'cardsWaste',
    'cardWasted',
    'cardsWasted',
    'brokenCards',
    'brokenCard',
    'brokenCount',
    'cardBroken',
    'cardsBroken',
    'reprintedCards',
    'reprintedCard',
    'reprintCards',
    'reprintCard',
    'reprintCount',
    'cardReprint',
    'cardReprinted',
    'invalidCards',
    'invalidCard',
    'invalidCount',
    'cardInvalid',
    'cardsInvalid',
    'rejectedCards',
    'rejectedCard',
    'rejectedCount',
    'rejectCards',
    'rejectCard',
    'rejectCount',
    'cardReject',
    'cardRejected',
    'corruptedCards',
    'corruptedCard',
    'corruptCards',
    'corruptCard',
    'faultyCards',
    'faultyCard',
    'faultCards',
    'faultCard',
    'scrappedCards',
    'scrappedCard',
    'scrapCards',
    'scrapCard',
    'misprintedCards',
    'misprintedCard',
    'misprintCards',
    'misprintCard',
    'mistakeCards',
    'mistakeCard',
    'destroyedCards',
    'destroyedCard',
    'destroyCards',
    'destroyCard',
    'unusableCards',
    'unusableCard',
    'batSia',
    'bat_sia',
    'batsia',
    'butSia',
    'but_sia',
    'butsia',
    'budSia',
    'bud_sia',
    'budsia',
    'cardSia',
    'card_sia',
    'cardsia',
    'siaCard',
    'sia_card',
    'batChamrud',
  ];

  // 0. Extract Spoiled Cards (`บัตรเสีย`) FIRST when an explicit spoiled-card key exists,
  // so that `extractEightGroupCounts` (Strategy 3 positional nested-map fallback) cannot consume it.
  let spoiledRes = findNumberSmart(
    flat,
    SPOILED_CARD_CANDIDATES,
    usedKeys,
    customMap?.spoiledCards,
    isExcludedFromSpoiledCards
  );

  // 1. Extract the 8 Target Groups (`group1`..`group8`)
  const { counts: rawEightCounts, matchedKeys: groupMatchedKeys } =
    extractEightGroupCounts(rawDoc, flat, usedKeys, customMap);
  groupMatchedKeys.forEach((mk, idx) => {
    if (mk) matchedFieldsDebug[`group${idx + 1}`] = mk;
  });
  const sumOfEightGroups = rawEightCounts.reduce((acc, n) => acc + n, 0);

  // 2. Extract Total Appointments (`คิวนัดหมายทั้งหมด`)
  const appointmentRes = findNumberSmart(
    flat,
    [
      'queueAppointment',
      'queue_appointment',
      'totalAppointments',
      'appointmentQueue',
      'appointmentCount',
      'appointments',
      'appointmentTotal',
      'totalAppointment',
      'totalQueue',
      'queueTotal',
      'queueCount',
      'queues',
      'dailyQueue',
      'targetQueue',
      'queueTarget',
      'bookedQueue',
      'registeredQueue',
      'dailyTarget',
      'totalTarget',
      'targetCount',
      'bookings',
      'bookingCount',
      'totalBookings',
      'booking',
      'booked',
      'bookedCount',
      'totalBooked',
      'quota',
      'dailyQuota',
      'registered',
      'registeredCount',
      'totalRegistered',
      'scheduled',
      'scheduledCount',
      'totalScheduled',
      'expected',
      'expectedCount',
      'qTotal',
      'total_appointments',
      'total_queue',
      'appointment_count',
      'queue_count',
      'appointment',
      'queue',
      'target',
      'คิวนัดหมายทั้งหมด',
      'คิวนัดหมาย',
      'นัดหมายทั้งหมด',
      'นัดหมาย',
      'จำนวนคิว',
      'คิวรวม',
      'เป้าหมายประจำวัน',
      'เป้าหมายคิวนัดหมาย',
      'เป้าหมาย',
    ],
    usedKeys,
    customMap?.totalAppointments,
    isExcludedFromAppointments
  );
  if (appointmentRes.matchedKey) {
    matchedFieldsDebug.totalAppointments = appointmentRes.matchedKey;
  }

  // 3. Extract Completed Cards (`ออกบัตรสำเร็จ`)
  const completedRes = findNumberSmart(
    flat,
    [
      'completedCards',
      'completedCard',
      'cardsCompleted',
      'cardCompleted',
      'issuedCards',
      'issuedCard',
      'cardsIssued',
      'cardIssued',
      'successCards',
      'successCard',
      'cardSuccess',
      'successCount',
      'completedCount',
      'issuedCount',
      'totalIssued',
      'totalCompleted',
      'totalSuccess',
      'completed',
      'issued',
      'success',
      'done',
      'doneCount',
      'approved',
      'approvedCount',
      'printedCards',
      'printedCard',
      'cardsPrinted',
      'printedCount',
      'totalPrinted',
      'printed',
      'totalCards',
      'cardTotal',
      'cardsCount',
      'cardCount',
      'goodCards',
      'validCards',
      'permitIssued',
      'permitsIssued',
      'workPermitIssued',
      'workPermitsIssued',
      'servedCount',
      'totalServed',
      'served',
      'completed_cards',
      'issued_cards',
      'success_count',
      'total',
      'amount',
      'quantity',
      'ออกบัตรสำเร็จ',
      'ออกบัตร',
      'บัตรดี',
      'สำเร็จ',
      'ออกใบอนุญาตสำเร็จ',
      'ออกใบอนุญาต',
      'รวมออกบัตร',
    ],
    usedKeys,
    customMap?.completedCards,
    isSpoiledCardKey
  );
  if (completedRes.matchedKey) {
    matchedFieldsDebug.completedCards = completedRes.matchedKey;
  }

  // 4. Extract No-Show (`ไม่มาตามนัด`)
  const noShowRes = findNumberSmart(
    flat,
    [
      'noShowCount',
      'noShows',
      'noShow',
      'no_show',
      'noshow',
      'no_show_count',
      'noShowQueue',
      'noShowPersons',
      'noShowPeople',
      'absentCount',
      'absents',
      'absent',
      'absentQueue',
      'absentPersons',
      'absenceCount',
      'absence',
      'missedCount',
      'missedAppointments',
      'missedAppointment',
      'missedQueue',
      'missed',
      'notComeCount',
      'notCome',
      'not_come',
      'didNotCome',
      'notAttendCount',
      'notAttend',
      'unattendedCount',
      'unattended',
      'notShowCount',
      'notShow',
      'noAppearCount',
      'noAppear',
      'skipCount',
      'skipped',
      'ไม่มาตามนัด',
      'ไม่มา',
      'ขาดนัด',
    ],
    usedKeys,
    customMap?.noShowCount,
    isSpoiledCardKey
  );
  if (noShowRes.matchedKey) {
    matchedFieldsDebug.noShowCount = noShowRes.matchedKey;
  }

  // 5. Extract Wrong Date (`มาไม่ตรงวันนัด`)
  const wrongDateRes = findNumberSmart(
    flat,
    [
      'wrongDateCount',
      'wrongDates',
      'wrongDate',
      'wrong_date',
      'wrongdate',
      'wrong_date_count',
      'wrongDatePersons',
      'wrongDateQueue',
      'wrongDayCount',
      'wrongDays',
      'wrongDay',
      'wrong_day',
      'wrongAppointmentDate',
      'wrongAppointment',
      'offScheduleCount',
      'offSchedule',
      'off_schedule',
      'outOfScheduleCount',
      'outOfSchedule',
      'unscheduledCount',
      'unscheduled',
      'walkInCount',
      'walkIns',
      'walkIn',
      'walk_in',
      'walkin',
      'lateCount',
      'lateArrival',
      'late',
      'otherDateCount',
      'otherDate',
      'otherDayCount',
      'otherDay',
      'differentDate',
      'mismatchDateCount',
      'mismatchDate',
      'dateMismatch',
      'notOnTime',
      'notOnDateCount',
      'notOnDate',
      'wrongQueueCount',
      'wrongQueue',
      'rescheduledCount',
      'rescheduled',
      'cameWrongDate',
      'มาไม่ตรงวันนัด',
      'ไม่ตรงวันนัด',
      'ผิดวันนัด',
      'มาผิดวัน',
      'มาผิดวันนัด',
      'นอกคิว',
    ],
    usedKeys,
    customMap?.wrongDateCount,
    isSpoiledCardKey
  );
  if (wrongDateRes.matchedKey) {
    matchedFieldsDebug.wrongDateCount = wrongDateRes.matchedKey;
  }

  // 6. Fallback Spoiled Cards (`บัตรเสีย`) check if not matched in Step 0
  if (spoiledRes.value === null) {
    spoiledRes = findNumberSmart(
      flat,
      SPOILED_CARD_CANDIDATES,
      usedKeys,
      customMap?.spoiledCards,
      isExcludedFromSpoiledCards
    );
  }
  if (spoiledRes.matchedKey) {
    matchedFieldsDebug.spoiledCards = spoiledRes.matchedKey;
  }

  const noShowCount = noShowRes.value !== null ? noShowRes.value : 0;
  const wrongDateCount = wrongDateRes.value !== null ? wrongDateRes.value : 0;
  const spoiledCards = spoiledRes.value !== null ? spoiledRes.value : 0;

  // Reconcile totals between `completedCards`, `totalAppointments`, and the 8 groups
  let completedCards =
    completedRes.value !== null && completedRes.value > 0
      ? completedRes.value
      : sumOfEightGroups > 0
      ? sumOfEightGroups
      : appointmentRes.value !== null &&
        appointmentRes.value > 0 &&
        (noShowCount > 0 || wrongDateCount > 0)
      ? Math.max(0, appointmentRes.value - noShowCount + wrongDateCount)
      : completedRes.value ?? 0;

  const finalEightCounts = [...rawEightCounts];
  const anyGroupMatched = groupMatchedKeys.some((mk) => mk !== null);
  const currentGroupSum = finalEightCounts.reduce((a, b) => a + b, 0);
  if (!anyGroupMatched && currentGroupSum === 0 && completedCards > 0) {
    finalEightCounts[0] = completedCards;
  } else if (completedCards === 0 && currentGroupSum > 0) {
    completedCards = currentGroupSum;
  }

  const totalGroupsSum =
    finalEightCounts.reduce((a, b) => a + b, 0) || completedCards;

  const derivedAppointmentsFromCompleted =
    completedCards > 0 && (noShowCount > 0 || wrongDateCount > 0)
      ? Math.max(0, completedCards + noShowCount - wrongDateCount)
      : 0;

  const totalAppointments =
    appointmentRes.value !== null && appointmentRes.value > 0
      ? appointmentRes.value
      : derivedAppointmentsFromCompleted > 0
      ? derivedAppointmentsFromCompleted
      : totalGroupsSum > 0
      ? totalGroupsSum
      : 0;

  const baseQueue = totalAppointments > 0 ? totalAppointments : 1;
  const serviceSuccessRatePercent =
    totalAppointments > 0
      ? Math.min(100, Math.round((completedCards / totalAppointments) * 100))
      : completedCards > 0
      ? 100
      : 0;

  const completedPercent = serviceSuccessRatePercent;
  const noShowPercent =
    totalAppointments > 0 ? Math.round((noShowCount / baseQueue) * 100) : 0;
  const wrongDatePercent =
    totalAppointments > 0 ? Math.round((wrongDateCount / baseQueue) * 100) : 0;
  const spoiledBase = completedCards > 0 ? completedCards : baseQueue;
  const spoiledPercent =
    spoiledCards > 0
      ? Math.max(1, Math.round((spoiledCards / spoiledBase) * 100))
      : 0;

  const groups: DoeTargetGroupItem[] = DEFAULT_DOE_GROUPS_META.map(
    (meta, idx) => {
      const c = finalEightCounts[idx] || 0;
      const pct =
        totalGroupsSum > 0 ? Math.round((c / totalGroupsSum) * 100) : 0;
      return {
        ...meta,
        count: c,
        percent: pct,
        matchedField: groupMatchedKeys[idx] || undefined,
      };
    }
  );

  const rawReporterName = findStringByKeys(
    flat,
    [
      'reporterName',
      'reporter',
      'reportedBy',
      'authorName',
      'author',
      'staffName',
      'officerName',
      'createdBy',
      'ผู้รายงาน',
    ],
    'นางสาววรารัตน์ เหล็กดี',
    customMap?.reporterName
  );
  const reporterName = rawReporterName.replace(/\s+/g, ' ').trim();

  const rawReporterPosition = findStringByKeys(
    flat,
    [
      'reporterPosition',
      'position',
      'jobTitle',
      'role',
      'officerPosition',
      'ตำแหน่ง',
    ],
    'นักวิชาการแรงงาน',
    customMap?.reporterPosition
  );
  const reporterPosition = rawReporterPosition
    .replace('นักวิชาการแรงาน', 'นักวิชาการแรงงาน')
    .trim();

  const rawContactPhone = findStringByKeys(
    flat,
    [
      'contactPhone',
      'phoneNumber',
      'phone',
      'tel',
      'telephone',
      'contact',
      'เบอร์โทร',
    ],
    '034-836-223 ถึง 5',
    customMap?.contactPhone
  );
  const contactPhone = /\d{6,}|\d{2,3}-\d{3}/.test(rawContactPhone)
    ? rawContactPhone.trim()
    : '034-836-223 ถึง 5';

  return {
    docId,
    reportDateRaw,
    reportDateThai,
    reportBadgeText: 'ข้อมูลรายงานประจำวัน',
    departmentEng: 'DEPARTMENT OF EMPLOYMENT',
    departmentThai: 'กรมการจัดหางาน กระทรวงแรงงาน',
    provincialOffice,
    officeSubtitleEng: 'Samut Sakhon Provincial Employment Office',
    headerRightSubtitle: 'ศูนย์บริการใบอนุญาตทำงานประจำพื้นที่',
    executivePillText: 'EXECUTIVE SUMMARY REPORT · เรียน อธิบดี / ผู้บริหาร',
    reportMainTitle,
    serviceCenterName,
    provinceName,
    cleanProvince,
    regionName,
    totalAppointments,
    completedCards,
    noShowCount,
    wrongDateCount,
    spoiledCards,
    completedPercent,
    noShowPercent,
    wrongDatePercent,
    spoiledPercent,
    serviceSuccessRatePercent,
    groups,
    totalGroupsSum,
    reporterName,
    reporterPosition,
    verifiedStatusText: 'ตรวจสอบแล้ว',
    contactPhone,
    matchedFieldsDebug,
    embeddedImageUrl,
    rawDoc,
  };
}

export interface DoeFilterContext {
  selectedDateThai?: string;
  selectedRegion?: string;
  selectedProvince?: string;
}

/**
 * Aggregates multiple `DoePosterReportData` items into a single Combined Executive Summary Poster,
 * dynamically adapting the header, date badge, and province/region labels based on the active filter bar.
 */
export function aggregateDoePosters(
  posters: DoePosterReportData[],
  filterContext?: DoeFilterContext
): DoePosterReportData {
  if (posters.length === 0) {
    return SAMPLE_DOE_POSTER_DATA;
  }
  const isSingleDateSelection =
    Boolean(filterContext?.selectedDateThai) &&
    filterContext?.selectedDateThai !== 'ALL';
  if (posters.length === 1 && isSingleDateSelection) {
    return posters[0];
  }

  let totalAppointments = 0;
  let completedCards = 0;
  let noShowCount = 0;
  let wrongDateCount = 0;
  let spoiledCards = 0;
  const groupSums = [0, 0, 0, 0, 0, 0, 0, 0];
  const uniqueProvinces = new Set<string>();
  const uniqueDates = new Set<string>();
  const mergedMatchedDebug: Record<string, string> = {};

  posters.forEach((p) => {
    totalAppointments += p.totalAppointments;
    completedCards += p.completedCards;
    noShowCount += p.noShowCount;
    wrongDateCount += p.wrongDateCount;
    spoiledCards += p.spoiledCards;
    uniqueProvinces.add(p.cleanProvince);
    uniqueDates.add(p.reportDateThai);
    p.groups.forEach((g, idx) => {
      groupSums[idx] = (groupSums[idx] || 0) + g.count;
    });
    if (p.matchedFieldsDebug) {
      Object.entries(p.matchedFieldsDebug).forEach(([slot, matchedField]) => {
        if (matchedField && !mergedMatchedDebug[slot]) {
          mergedMatchedDebug[slot] = matchedField;
        }
      });
    }
  });

  const totalGroupsSum =
    groupSums.reduce((a, b) => a + b, 0) || completedCards;
  const baseQueue = totalAppointments > 0 ? totalAppointments : 1;
  const serviceSuccessRatePercent =
    totalAppointments > 0
      ? Math.min(100, Math.round((completedCards / totalAppointments) * 100))
      : 100;

  const groups: DoeTargetGroupItem[] = DEFAULT_DOE_GROUPS_META.map(
    (meta, idx) => {
      const c = groupSums[idx] || 0;
      const pct =
        totalGroupsSum > 0 ? Math.round((c / totalGroupsSum) * 100) : 0;
      return {
        ...meta,
        count: c,
        percent: pct,
        matchedField: mergedMatchedDebug[`group${idx + 1}`],
      };
    }
  );

  const first = posters[0];
  const isSingleDate =
    (filterContext?.selectedDateThai &&
      filterContext.selectedDateThai !== 'ALL') ||
    uniqueDates.size === 1;
  const isSingleProvince =
    (filterContext?.selectedProvince &&
      filterContext.selectedProvince !== 'ALL') ||
    uniqueProvinces.size === 1;

  const displayDateText = isSingleDate
    ? filterContext?.selectedDateThai &&
      filterContext.selectedDateThai !== 'ALL'
      ? filterContext.selectedDateThai
      : first.reportDateThai
    : `ภาพรวมสะสมทั้งหมด (${posters.length} รายการ)`;

  const displayBadgeText = isSingleDate
    ? 'ข้อมูลรายงานประจำวัน'
    : 'ข้อมูลรายงานสะสมรวม';

  const displayProvincialOffice = isSingleProvince
    ? first.provincialOffice
    : `สรุปภาพรวมศูนย์บริการใบอนุญาตทำงานเฉพาะกิจ (${uniqueProvinces.size} จังหวัด)`;

  const displayServiceCenter = isSingleProvince
    ? first.serviceCenterName
    : `ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว (Mobile Unit) รวม ${posters.length} รายงาน (${uniqueProvinces.size} แห่ง)`;

  const displayProvincePill = isSingleProvince
    ? first.provinceName
    : `ดูภาพรวมทั้งหมด (${uniqueProvinces.size} แห่ง)`;

  // Build merged rawDoc with summed numeric values across all reports so Field Mapping UI shows all fields & totals
  const mergedRawDoc: Record<string, unknown> = { ...first.rawDoc };
  const numericSums = new Map<string, number>();
  posters.forEach((p) => {
    const flatP = flattenDocumentDeep(p.rawDoc);
    Object.entries(flatP).forEach(([k, v]) => {
      if (k === 'id') return;
      const numVal = parseValidNumber(v);
      if (numVal !== null) {
        numericSums.set(k, (numericSums.get(k) || 0) + numVal);
      } else if (mergedRawDoc[k] === undefined) {
        mergedRawDoc[k] = v;
      }
    });
  });
  numericSums.forEach((sumVal, k) => {
    mergedRawDoc[k] = sumVal;
  });

  const isCumulativeView =
    !filterContext?.selectedDateThai ||
    filterContext.selectedDateThai === 'ALL' ||
    posters.length > 1;

  if (posters.length === 1 && !isCumulativeView) {
    return posters[0];
  }

  return {
    ...first,
    docId: `SUMMARY-${posters.length}-REPORTS`,
    reportBadgeText: displayBadgeText,
    reportDateThai: displayDateText,
    provincialOffice: displayProvincialOffice,
    serviceCenterName: displayServiceCenter,
    provinceName: displayProvincePill,
    totalAppointments,
    completedCards,
    noShowCount,
    wrongDateCount,
    spoiledCards,
    completedPercent: serviceSuccessRatePercent,
    noShowPercent:
      totalAppointments > 0 ? Math.round((noShowCount / baseQueue) * 100) : 0,
    wrongDatePercent:
      totalAppointments > 0
        ? Math.round((wrongDateCount / baseQueue) * 100)
        : 0,
    spoiledPercent:
      spoiledCards > 0
        ? Math.max(
            1,
            Math.round(
              (spoiledCards /
                (completedCards > 0 ? completedCards : baseQueue)) *
                100
            )
          )
        : 0,
    serviceSuccessRatePercent,
    groups,
    totalGroupsSum,
    reporterName: isCumulativeView
      ? 'สำนักบริหารแรงงานต่างด้าว'
      : first.reporterName,
    reporterPosition: isCumulativeView
      ? 'กรมการจัดหางาน กระทรวงแรงงาน'
      : first.reporterPosition,
    contactPhone: isCumulativeView
      ? '034-836-223 ถึง 5'
      : first.contactPhone,
    matchedFieldsDebug: mergedMatchedDebug,
    embeddedImageUrl: null,
    rawDoc: mergedRawDoc,
  };
}

/**
 * Exact reference sample matching the Samut Sakhon DOE Report Poster
 */
export const SAMPLE_DOE_POSTER_DATA: DoePosterReportData =
  mapFirestoreDocToDoePoster({
    id: 'report-1792475569363-8yfxq0d',
    reportDate: '2026-10-20',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 978,
    cardsIssued: 939,
    missedAppointment: 289,
    wrongAppointmentDate: 242,
    cardsNotIssued: 6,
    customCategoryValues: { cat_1791818621214: 403 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 536,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'ณัฏฐพร อิ่มอำไภย',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '0644563947',
  });

/**
 * Exact 11-report Samut Sakhon (`สมุทรสาคร`) dataset (10–20 ต.ค. 2569) synced from `doe-report-system`
 */
export const SAMPLE_13_DOE_REPORTS: DoePosterReportData[] = [
  SAMPLE_DOE_POSTER_DATA,
  mapFirestoreDocToDoePoster({
    id: 'report-1792397706475-kxdb28t',
    reportDate: '2026-10-19',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 262,
    cardsIssued: 315,
    missedAppointment: 45,
    wrongAppointmentDate: 98,
    cardsNotIssued: 2,
    customCategoryValues: { cat_1791818621214: 67 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 248,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'นางสาววรารัตน์ เหล็กดี',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
  mapFirestoreDocToDoePoster({
    id: 'report-1792390125570-bavz8yy',
    reportDate: '2026-10-18',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 800,
    cardsIssued: 517,
    missedAppointment: 283,
    wrongAppointmentDate: 0,
    cardsNotIssued: 1,
    customCategoryValues: { cat_1791818621214: 517 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 0,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'นางสาวกัลยกร เรืองเชื้อเหมือน',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
  mapFirestoreDocToDoePoster({
    id: 'report-1792378513114-cp0xftw',
    reportDate: '2026-10-17',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 800,
    cardsIssued: 563,
    missedAppointment: 263,
    wrongAppointmentDate: 0,
    cardsNotIssued: 5,
    customCategoryValues: { cat_1791818621214: 563 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 0,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'นางสาวณัชชา เฮงฮู้',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
  mapFirestoreDocToDoePoster({
    id: 'report-1792378720679-tmn2fx7',
    reportDate: '2026-10-16',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 1200,
    cardsIssued: 808,
    missedAppointment: 392,
    wrongAppointmentDate: 0,
    cardsNotIssued: 2,
    customCategoryValues: { cat_1791818621214: 637 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 171,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'นางสาวพัชรินทร์ หกเหลี่ยม',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
  mapFirestoreDocToDoePoster({
    id: 'report-1792379699841-p19n9i0',
    reportDate: '2026-10-15',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 1125,
    cardsIssued: 828,
    missedAppointment: 297,
    wrongAppointmentDate: 0,
    cardsNotIssued: 4,
    customCategoryValues: { cat_1791818621214: 710 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 118,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'นางสาวสุพัตรา อาจวิชัน',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
  mapFirestoreDocToDoePoster({
    id: 'report-1792379544476-i47ojhq',
    reportDate: '2026-10-14',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 1007,
    cardsIssued: 799,
    missedAppointment: 206,
    wrongAppointmentDate: 0,
    cardsNotIssued: 11,
    customCategoryValues: { cat_1791818621214: 657 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 142,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'นางสาวจิราวรรณ ศรีสุขสร้อย',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
  mapFirestoreDocToDoePoster({
    id: 'report-1792379216585-lkr6asc',
    reportDate: '2026-10-13',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 893,
    cardsIssued: 655,
    missedAppointment: 233,
    wrongAppointmentDate: 0,
    cardsNotIssued: 3,
    customCategoryValues: { cat_1791818621214: 543 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 112,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'นางสาวปิยะสุณี ศรีบุณยพัฒน์',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
  mapFirestoreDocToDoePoster({
    id: 'report-1792337306325-coruz62',
    reportDate: '2026-10-12',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 1201,
    cardsIssued: 1049,
    missedAppointment: 150,
    wrongAppointmentDate: 0,
    cardsNotIssued: 19,
    customCategoryValues: { cat_1791818621214: 901 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 148,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'นายทิชานนท์ จันทร์พรไพบูลย์',
    reporterPosition: 'เจ้าพนักงานแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
  mapFirestoreDocToDoePoster({
    id: 'report-1792378963539-tioh8se',
    reportDate: '2026-10-11',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 800,
    cardsIssued: 583,
    missedAppointment: 217,
    wrongAppointmentDate: 0,
    cardsNotIssued: 4,
    customCategoryValues: { cat_1791818621214: 583 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 0,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'นางสาวจิรารัตน์ ชัยสมุทร',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
  mapFirestoreDocToDoePoster({
    id: 'report-1792336671383-x9jngns',
    reportDate: '2026-10-10',
    officeName: 'สำนักงานจัดหางานจังหวัดสมุทรสาคร',
    centerName:
      'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ- วัดป้อมวิเชียรโชติการาม ต.มหาชัย อ.เมือง จังหวัดสมุทรสาคร',
    region: 'เฉพาะกิจ',
    queueAppointment: 800,
    cardsIssued: 518,
    missedAppointment: 282,
    wrongAppointmentDate: 0,
    cardsNotIssued: 7,
    customCategoryValues: { cat_1791818621214: 518 },
    modifyDetails: 0,
    section59: 0,
    section62: 0,
    section63_1: 0,
    section63_2: 0,
    section64: 0,
    substituteCard: 0,
    reporterName: 'ว่าที่ร.ต.หญิงอรอุมา อิ่มบุญสุ',
    reporterPosition: 'นักวิชาการแรงงาน',
    phoneNumber: '034-836-223 ถึง 5',
  }),
];



