import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  ArrowDownUp,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  Download,
  Edit3,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  Filter,
  FolderKanban,
  Image as ImageIcon,
  Layers,
  LogIn,
  LogOut,
  Maximize2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  auth,
  connectedProjectInfo,
  db,
  DEFAULT_EXTERNAL_ENDPOINT,
  ExternalFetchResult,
  fetchExternalFirestoreReports,
  googleProvider,
  handleFirestoreError,
  OperationType,
  parseFirestoreEndpoint,
  subscribeExternalFirestoreReports,
} from './firebase';
import {
  AggregatedRow,
  BLUEPRINT_CONSTRAINTS,
  GroupByDimension,
  RecordStatus,
  ReportRecord,
  ReportTemplate,
  sanitizeString,
} from './types';
import {
  MULTI_SYSTEM_SAMPLE_RECORDS,
  SAMPLE_JSON_IMPORT_PAYLOAD,
  SeedRecordInput,
} from './sampleData';
import {
  detectAndNormalizeImageString,
  ExtractedPosterData,
  extractPosterFromDoc,
} from './posterUtils';
import {
  aggregateDoePosters,
  CustomDoeFieldMap,
  DoePosterReportData,
  mapFirestoreDocToDoePoster,
  SAMPLE_13_DOE_REPORTS,
  SAMPLE_DOE_POSTER_DATA,
  THAI_REGIONS_LIST,
} from './doePosterUtils';
import { DoeReportPoster } from './components/DoeReportPoster';

type WorkspaceTab = 'external' | 'dashboard' | 'templates' | 'sync';
type ExternalViewMode = 'both' | 'posters' | 'table';
type DoeDisplayMode = 'filtered_summary' | 'single' | 'all' | 'sample';

const GROUP_BY_LABELS: Record<GroupByDimension, string> = {
  sourceSystem: 'ระบบต้นทาง (Source System)',
  category: 'หมวดหมู่รายงาน (Category)',
  department: 'แผนก / สาขา (Department)',
  status: 'สถานะรายการ (Status)',
  recordDate: 'วันที่รายการ (Record Date)',
};

const STATUS_LABELS: Record<RecordStatus, string> = {
  completed: 'สำเร็จแล้ว',
  pending: 'รอดำเนินการ',
  cancelled: 'ยกเลิกรายการ',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('th-TH', {
    maximumFractionDigits: 2,
  }).format(num);
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  if (typeof val === 'number') return formatNumber(val);
  if (typeof val === 'string') {
    if (val.startsWith('data:image/')) {
      return '[ข้อมูลรูปภาพ Base64]';
    }
    return val;
  }
  if (Array.isArray(val)) return val.map((v) => formatCellValue(v)).join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('external');

  // External Database Connection State (Pre-configured with the user's URL)
  const [externalUrl, setExternalUrl] = useState(DEFAULT_EXTERNAL_ENDPOINT);
  const [externalDbId, setExternalDbId] = useState(
    connectedProjectInfo.externalDatabaseId
  );
  const [externalCollection, setExternalCollection] = useState(
    connectedProjectInfo.externalCollection
  );
  const [customOwnerField, setCustomOwnerField] = useState('');
  const [externalResult, setExternalResult] =
    useState<ExternalFetchResult | null>(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalSearch, setExternalSearch] = useState('');
  const [externalGroupBy, setExternalGroupBy] = useState<string>('');
  const [externalMetricField, setExternalMetricField] =
    useState<string>('__COUNT__');
  const [externalGroupFilter, setExternalGroupFilter] = useState<string>('ALL');
  const [externalViewMode, setExternalViewMode] =
    useState<ExternalViewMode>('both');
  const [preferredImageField, setPreferredImageField] =
    useState<string>('AUTO');
  const [doeDisplayMode, setDoeDisplayMode] =
    useState<DoeDisplayMode>('filtered_summary');
  const [doeDateFilter, setDoeDateFilter] = useState<string>('ALL');
  const [doeRegionFilter, setDoeRegionFilter] = useState<string>(
    'เฉพาะกิจ (Mobile Unit)'
  );
  const [doeProvinceFilter, setDoeProvinceFilter] =
    useState<string>('สมุทรสาคร');
  const [customDoeFieldMap, setCustomDoeFieldMap] = useState<CustomDoeFieldMap>(
    {}
  );
  const [selectedDoeDocId, setSelectedDoeDocId] = useState<string>('');
  const [selectedRawDoc, setSelectedRawDoc] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [lightboxPoster, setLightboxPoster] =
    useState<ExtractedPosterData | null>(null);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);
  const [showDbSettings, setShowDbSettings] = useState(false);
  const [showDbPasscodeModal, setShowDbPasscodeModal] = useState(false);
  const [dbPasscodeInput, setDbPasscodeInput] = useState('');
  const [dbPasscodeError, setDbPasscodeError] = useState<string | null>(null);
  const [showDataTable, setShowDataTable] = useState(false);

  // Local Warehouse Firestore collections state
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Local Warehouse Filters & Grouping State
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceSystemFilter, setSourceSystemFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [groupByField, setGroupByField] =
    useState<GroupByDimension>('sourceSystem');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  // Edit Pending Record Modal State
  const [editingRecord, setEditingRecord] = useState<ReportRecord | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editAmount, setEditAmount] = useState('0');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editDate, setEditDate] = useState('2026-10-19');

  // Save Template Form State
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');

  // Manual Record Entry Form State
  const [newSourceSystem, setNewSourceSystem] = useState('ERP-SAP');
  const [newReferenceCode, setNewReferenceCode] = useState('SAP-INV-20261099');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('รายได้จากการขาย');
  const [newDepartment, setNewDepartment] = useState('ฝ่ายขายองค์กร (B2B)');
  const [newAmount, setNewAmount] = useState('45000');
  const [newQuantity, setNewQuantity] = useState('10');
  const [newStatus, setNewStatus] = useState<RecordStatus>('completed');
  const [newRecordDate, setNewRecordDate] = useState('2026-10-19');

  // JSON Batch Import State
  const [jsonInputText, setJsonInputText] = useState(
    SAMPLE_JSON_IMPORT_PAYLOAD
  );

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => {
      setFeedbackMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Automatically parse URL input when user pastes a full Firestore REST URL
  const handleExternalUrlChange = (val: string) => {
    setExternalUrl(val);
    if (val.includes('/databases/')) {
      const parsed = parseFirestoreEndpoint(
        val,
        externalDbId,
        externalCollection
      );
      setExternalDbId(parsed.databaseId);
      setExternalCollection(parsed.collectionPath);
    }
  };

  // Fetch from External Database (ai-studio-doe-984116b9-6043-43c8-97a4-66738b218bdc / reports)
  const handleFetchExternalDatabase = async () => {
    setExternalLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetchExternalFirestoreReports(
        externalUrl,
        externalDbId,
        externalCollection,
        customOwnerField
      );
      setExternalResult(res);
      setExternalGroupFilter('ALL');

      if (res.documents.length > 0) {
        const allKeys = new Set<string>();
        const numKeys = new Set<string>();
        res.documents.forEach((docObj) => {
          Object.entries(docObj).forEach(([k, v]) => {
            if (k !== 'id') {
              allKeys.add(k);
              if (typeof v === 'number') {
                numKeys.add(k);
              }
            }
          });
        });

        const preferredGroupKeys = [
          'status',
          'category',
          'type',
          'department',
          'sourceSystem',
          'priority',
          'stage',
          'ownerId',
          'userId',
        ];
        const foundGroup =
          preferredGroupKeys.find((k) => allKeys.has(k)) ||
          Array.from(allKeys)[0] ||
          'id';
        setExternalGroupBy((prev) =>
          prev && allKeys.has(prev) ? prev : foundGroup
        );

        const preferredMetricKeys = [
          'amount',
          'total',
          'price',
          'value',
          'score',
          'cost',
          'quantity',
          'count',
        ];
        const foundMetric = preferredMetricKeys.find((k) => numKeys.has(k));
        if (foundMetric) {
          setExternalMetricField((prev) =>
            prev !== '__COUNT__' && numKeys.has(prev) ? prev : foundMetric
          );
        } else {
          setExternalMetricField('__COUNT__');
        }

        showToast(
          `ดึงข้อมูลและรูปโปสเตอร์จาก "${res.parsedEndpoint.databaseId}" Collection "${res.parsedEndpoint.collectionPath}" สำเร็จ (${res.documents.length} รายการ)`
        );
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูลภายนอก'
      );
    } finally {
      setExternalLoading(false);
    }
  };

  // Auto-update in real-time via Firestore onSnapshot listener without requiring manual button clicks
  useEffect(() => {
    const unsub = subscribeExternalFirestoreReports(
      externalUrl,
      externalDbId,
      externalCollection,
      (liveResult) => {
        setExternalResult(liveResult);
        setExternalLoading(false);
      },
      () => {
        handleFetchExternalDatabase();
      }
    );
    return () => unsub();
  }, [externalUrl, externalDbId, externalCollection]);

  // Discover columns and detailed schema profile from external documents
  const externalSchema = useMemo(() => {
    const docs = externalResult?.documents || [];
    const columns = new Set<string>();
    const numericColumns = new Set<string>();
    const imageColumns = new Set<string>();
    const fieldStats = new Map<
      string,
      {
        types: Set<string>;
        nonNullCount: number;
        samples: string[];
      }
    >();

    docs.forEach((d) => {
      Object.entries(d).forEach(([k, v]) => {
        if (k === 'id') return;
        columns.add(k);
        if (typeof v === 'number') {
          numericColumns.add(k);
        }

        const isImg = Boolean(detectAndNormalizeImageString(v, k));
        if (isImg) {
          imageColumns.add(k);
        }

        const stat = fieldStats.get(k) || {
          types: new Set<string>(),
          nonNullCount: 0,
          samples: [],
        };

        if (v !== null && v !== undefined && v !== '') {
          stat.nonNullCount += 1;
          let detectedType: string = typeof v;
          if (isImg) {
            detectedType = 'image (poster URL / Base64)';
          } else if (Array.isArray(v)) {
            detectedType = 'array';
          } else if (
            typeof v === 'string' &&
            /^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(v)
          ) {
            detectedType = 'string (date/time)';
          } else if (typeof v === 'object') {
            detectedType = 'map (object)';
          }
          stat.types.add(detectedType);

          const formattedSample = formatCellValue(v);
          if (
            stat.samples.length < 3 &&
            !stat.samples.includes(formattedSample)
          ) {
            stat.samples.push(formattedSample);
          }
        }
        fieldStats.set(k, stat);
      });
    });

    const totalDocs = docs.length || 1;
    const fieldProfiles = Array.from(fieldStats.entries()).map(
      ([fieldName, info]) => ({
        fieldName,
        dataType: Array.from(info.types).join(' | ') || 'null',
        fillCount: info.nonNullCount,
        fillPercent: (info.nonNullCount / totalDocs) * 100,
        samples: info.samples,
      })
    );

    return {
      allColumns: Array.from(columns),
      numericColumns: Array.from(numericColumns),
      imageColumns: Array.from(imageColumns),
      fieldProfiles,
    };
  }, [externalResult]);

  // Filter external documents
  const filteredExternalDocs = useMemo(() => {
    const docs = externalResult?.documents || [];
    return docs.filter((d) => {
      if (externalGroupFilter !== 'ALL' && externalGroupBy) {
        const val = formatCellValue(d[externalGroupBy]);
        if (val !== externalGroupFilter) return false;
      }
      if (externalSearch.trim()) {
        const q = externalSearch.toLowerCase();
        const matchAny = Object.values(d).some((v) =>
          formatCellValue(v).toLowerCase().includes(q)
        );
        if (!matchAny) return false;
      }
      return true;
    });
  }, [externalResult, externalGroupFilter, externalGroupBy, externalSearch]);

  // Extract Poster Card data for each filtered document
  const extractedPosters = useMemo<ExtractedPosterData[]>(() => {
    return filteredExternalDocs.map((docObj) =>
      extractPosterFromDoc(docObj, preferredImageField)
    );
  }, [filteredExternalDocs, preferredImageField]);

  const postersWithImagesCount = useMemo(() => {
    return extractedPosters.filter((p) => Boolean(p.primaryImageUrl)).length;
  }, [extractedPosters]);

  // Map every filtered document in `reports` into the Official DOE Executive Summary Report Poster format
  const liveDoePostersList = useMemo<DoePosterReportData[]>(() => {
    return extractedPosters.map((p) =>
      mapFirestoreDocToDoePoster(p.rawDoc, p.primaryImageUrl, customDoeFieldMap)
    );
  }, [extractedPosters, customDoeFieldMap]);

  // Use live database documents if present; otherwise provide the Samut Sakhon dataset
  const baseDoeDataset = useMemo<DoePosterReportData[]>(() => {
    const rawList =
      liveDoePostersList.length > 0
        ? liveDoePostersList
        : customDoeFieldMap && Object.keys(customDoeFieldMap).length > 0
        ? SAMPLE_13_DOE_REPORTS.map((p) =>
            mapFirestoreDocToDoePoster(
              p.rawDoc,
              p.embeddedImageUrl,
              customDoeFieldMap
            )
          )
        : SAMPLE_13_DOE_REPORTS;

    const samutSakhonOnly = rawList.filter(
      (item) => item.cleanProvince === 'สมุทรสาคร'
    );
    const filtered = samutSakhonOnly.length > 0 ? samutSakhonOnly : rawList;
    return [...filtered].sort((a, b) =>
      String(b.reportDateRaw || '').localeCompare(String(a.reportDateRaw || ''))
    );
  }, [liveDoePostersList, customDoeFieldMap]);

  // Reset date filter if live database documents arrive and don't match the initial sample filter
  useEffect(() => {
    if (liveDoePostersList.length > 0) {
      const hasDate = liveDoePostersList.some(
        (d) => d.reportDateThai === doeDateFilter
      );
      if (!hasDate && doeDateFilter !== 'ALL') {
        setDoeDateFilter('ALL');
      }
    }
  }, [liveDoePostersList]);

  // 1. Available Daily Date Options (`รอบ/ช่วงวันที่`)
  const doeDateOptions = useMemo(() => {
    const map = new Map<string, number>();
    baseDoeDataset.forEach((item) => {
      map.set(
        item.reportDateThai,
        (map.get(item.reportDateThai) || 0) + 1
      );
    });
    return Array.from(map.entries()).map(([dateThai, count]) => ({
      dateThai,
      count,
    }));
  }, [baseDoeDataset]);

  // 2. Available Region Options (`ภูมิภาค`) filtered by selected date
  const doeRegionOptions = useMemo(() => {
    const dateFiltered = baseDoeDataset.filter(
      (item) =>
        doeDateFilter === 'ALL' || item.reportDateThai === doeDateFilter
    );
    const map = new Map<string, number>();
    THAI_REGIONS_LIST.forEach((reg) => map.set(reg, 0));
    dateFiltered.forEach((item) => {
      map.set(item.regionName, (map.get(item.regionName) || 0) + 1);
    });
    return Array.from(map.entries())
      .filter(([, count]) => count > 0)
      .map(([region, count]) => ({ region, count }));
  }, [baseDoeDataset, doeDateFilter]);

  // 3. Available Province Options (`เลือกจังหวัด`) filtered by selected date & region
  const doeProvinceOptions = useMemo(() => {
    const subset = baseDoeDataset.filter((item) => {
      if (doeDateFilter !== 'ALL' && item.reportDateThai !== doeDateFilter) {
        return false;
      }
      if (doeRegionFilter !== 'ALL' && item.regionName !== doeRegionFilter) {
        return false;
      }
      return true;
    });
    const map = new Map<string, { count: number; office: string }>();
    subset.forEach((item) => {
      const cur = map.get(item.cleanProvince) || {
        count: 0,
        office: item.provincialOffice,
      };
      cur.count += 1;
      map.set(item.cleanProvince, cur);
    });
    return Array.from(map.entries()).map(([province, info]) => ({
      province,
      count: info.count,
      office: info.office,
    }));
  }, [baseDoeDataset, doeDateFilter, doeRegionFilter]);

  // Filtered DOE Posters matching the 3-pill selector bar (`รอบ/ช่วงวันที่`, `ภูมิภาค`, `เลือกจังหวัด`)
  const doePostersList = useMemo<DoePosterReportData[]>(() => {
    const hasSamutSakhon = baseDoeDataset.some(
      (item) => item.cleanProvince === 'สมุทรสาคร'
    );
    return baseDoeDataset.filter((item) => {
      if (doeDateFilter !== 'ALL' && item.reportDateThai !== doeDateFilter) {
        return false;
      }
      if (
        hasSamutSakhon &&
        doeProvinceFilter !== 'ALL' &&
        item.cleanProvince !== doeProvinceFilter
      ) {
        return false;
      }
      return true;
    });
  }, [baseDoeDataset, doeDateFilter, doeRegionFilter, doeProvinceFilter]);

  // Combined / Aggregated DOE Poster across all filtered documents
  const combinedDoePoster = useMemo<DoePosterReportData>(() => {
    return aggregateDoePosters(
      doePostersList.length > 0 ? doePostersList : baseDoeDataset,
      {
        selectedDateThai: doeDateFilter,
        selectedRegion: doeRegionFilter,
        selectedProvince: doeProvinceFilter,
      }
    );
  }, [doePostersList, baseDoeDataset, doeDateFilter, doeRegionFilter, doeProvinceFilter]);

  // Currently selected individual DOE Poster
  const activeSingleDoePoster = useMemo<DoePosterReportData>(() => {
    if (doePostersList.length === 0) return SAMPLE_DOE_POSTER_DATA;
    const found = doePostersList.find((d) => d.docId === selectedDoeDocId);
    return found || doePostersList[0];
  }, [doePostersList, selectedDoeDocId]);

  // Aggregate external documents dynamically
  const externalAggregated = useMemo(() => {
    const groupField =
      externalGroupBy || externalSchema.allColumns[0] || 'id';
    const map = new Map<string, { count: number; metricSum: number }>();

    let grandTotalMetric = 0;

    filteredExternalDocs.forEach((d) => {
      const key = formatCellValue(d[groupField] ?? 'ไม่ระบุ');
      const metricVal =
        externalMetricField === '__COUNT__'
          ? 1
          : Number(d[externalMetricField]) || 0;

      const cur = map.get(key) || { count: 0, metricSum: 0 };
      cur.count += 1;
      cur.metricSum += metricVal;
      grandTotalMetric += metricVal;
      map.set(key, cur);
    });

    const rows = Array.from(map.entries()).map(([key, val]) => ({
      key,
      count: val.count,
      metricSum: val.metricSum,
      sharePercent:
        grandTotalMetric > 0 ? (val.metricSum / grandTotalMetric) * 100 : 0,
    }));

    rows.sort((a, b) => b.metricSum - a.metricSum);

    return {
      groupField,
      grandTotalMetric,
      rows,
    };
  }, [
    filteredExternalDocs,
    externalGroupBy,
    externalMetricField,
    externalSchema.allColumns,
  ]);

  // Download Poster Image helper
  const handleDownloadPosterImage = (poster: ExtractedPosterData) => {
    if (!poster.primaryImageUrl) return;
    const link = document.createElement('a');
    link.href = poster.primaryImageUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute(
      'download',
      `poster_${poster.docId}_${new Date().toISOString().slice(0, 10)}.png`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`ดาวน์โหลดรูปโปสเตอร์ "${poster.title}" เรียบร้อยแล้ว`);
  };

  // Sync External `reports` documents into local `report_records` collection
  const handleSyncExternalToWarehouse = async () => {
    if (!user || filteredExternalDocs.length === 0) return;
    setActionBusy(true);
    setErrorBanner(null);
    const path = 'report_records';

    try {
      const batch = writeBatch(db);
      const sourceLabel = sanitizeString(
        `${externalDbId.slice(0, 24)}:${externalCollection}`,
        BLUEPRINT_CONSTRAINTS.RECORD.SOURCE_SYSTEM_MAX,
        'EXTERNAL-DB'
      );

      filteredExternalDocs.slice(0, 50).forEach((extDoc, index) => {
        const newDocRef = doc(collection(db, path));
        const rawTitle = String(
          extDoc.title ||
            extDoc.posterTitle ||
            extDoc.name ||
            extDoc.subject ||
            extDoc.description ||
            extDoc.summary ||
            extDoc.reportName ||
            `รายงานโปสเตอร์จาก ${externalCollection} #${extDoc.id || index + 1}`
        );
        const rawCategory = String(
          extDoc.category ||
            extDoc.type ||
            extDoc.reportType ||
            extDoc.group ||
            'รายงานโปสเตอร์'
        );
        const rawDept = String(
          extDoc.department ||
            extDoc.branch ||
            extDoc.division ||
            extDoc.unit ||
            externalCollection
        );
        const rawRef = String(
          extDoc.referenceCode ||
            extDoc.code ||
            extDoc.reportId ||
            extDoc.id ||
            `EXT-${index + 1}`
        );
        const rawAmount = Number(
          extDoc.amount ??
            extDoc.total ??
            extDoc.value ??
            extDoc.price ??
            extDoc.score ??
            extDoc.cost ??
            0
        );
        const rawQty = Number(extDoc.quantity ?? extDoc.count ?? 1);

        const rawStatus = String(extDoc.status || 'completed').toLowerCase();
        const mappedStatus: RecordStatus =
          rawStatus === 'pending' || rawStatus === 'draft'
            ? 'pending'
            : rawStatus === 'cancelled' || rawStatus === 'rejected'
            ? 'cancelled'
            : 'completed';

        const rawDateStr = String(
          extDoc.recordDate ||
            extDoc.date ||
            extDoc.reportDate ||
            extDoc.createdAt ||
            '2026-10-19'
        ).slice(0, 10);
        const validDate = BLUEPRINT_CONSTRAINTS.RECORD.DATE_PATTERN.test(
          rawDateStr
        )
          ? rawDateStr
          : '2026-10-19';

        batch.set(newDocRef, {
          ownerId: user.uid,
          sourceSystem: sourceLabel,
          referenceCode: sanitizeString(
            rawRef,
            BLUEPRINT_CONSTRAINTS.RECORD.REFERENCE_CODE_MAX,
            `EXT-${index + 1}`
          ),
          title: sanitizeString(
            rawTitle,
            BLUEPRINT_CONSTRAINTS.RECORD.TITLE_MAX,
            'รายการจากฐานข้อมูลภายนอก'
          ),
          category: sanitizeString(
            rawCategory,
            BLUEPRINT_CONSTRAINTS.RECORD.CATEGORY_MAX,
            'รายงานโปสเตอร์'
          ),
          department: sanitizeString(
            rawDept,
            BLUEPRINT_CONSTRAINTS.RECORD.DEPARTMENT_MAX,
            'ส่วนกลาง'
          ),
          amount: Math.min(
            Math.max(0, isNaN(rawAmount) ? 0 : rawAmount),
            BLUEPRINT_CONSTRAINTS.RECORD.AMOUNT_MAX
          ),
          quantity: Math.min(
            Math.max(0, isNaN(rawQty) ? 1 : rawQty),
            BLUEPRINT_CONSTRAINTS.RECORD.QUANTITY_MAX
          ),
          status: mappedStatus,
          recordDate: validDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      showToast(
        `ซิงค์ข้อมูลจำนวน ${Math.min(50, filteredExternalDocs.length)} รายการจาก Collection "${externalCollection}" เข้าสู่คลังรายงานหลักสำเร็จ`
      );
      setActiveTab('dashboard');
    } catch (error) {
      setActionBusy(false);
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setActionBusy(false);
    }
  };

  // Export External Collection directly to CSV
  const handleExportExternalCsv = () => {
    if (filteredExternalDocs.length === 0) return;
    const cols = ['id', ...externalSchema.allColumns];
    const rows = filteredExternalDocs.map((d) =>
      cols.map((c) => {
        const str = formatCellValue(d[c]).replace(/"/g, '""');
        return `"${str}"`;
      })
    );
    const csvContent =
      '\uFEFF' + [cols.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `${externalCollection}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(
      `ส่งออกข้อมูล Collection "${externalCollection}" เป็นไฟล์ CSV สำเร็จ`
    );
  };

  // Export External Collection directly to JSON
  const handleExportExternalJson = () => {
    if (filteredExternalDocs.length === 0) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      sourceEndpoint: externalResult?.parsedEndpoint,
      totalDocuments: filteredExternalDocs.length,
      aggregatedSummary: externalAggregated,
      documents: filteredExternalDocs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `${externalCollection}_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(
      `ส่งออกข้อมูล Collection "${externalCollection}" เป็นไฟล์ JSON สำเร็จ`
    );
  };

  // Real-time listeners for local warehouse report_records and report_templates
  useEffect(() => {
    if (!authReady || !user) {
      setRecords([]);
      setTemplates([]);
      return;
    }

    setLoadingData(true);
    setErrorBanner(null);

    const recordsPath = 'report_records';
    const recordsQuery = query(
      collection(db, recordsPath),
      where('ownerId', '==', user.uid)
    );

    const unsubRecords = onSnapshot(
      recordsQuery,
      (snapshot) => {
        const loaded: ReportRecord[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ownerId: String(data.ownerId || ''),
            sourceSystem: String(data.sourceSystem || ''),
            referenceCode: String(data.referenceCode || ''),
            title: String(data.title || ''),
            category: String(data.category || ''),
            department: String(data.department || ''),
            amount: Number(data.amount || 0),
            quantity: Number(data.quantity || 0),
            status: (data.status as RecordStatus) || 'pending',
            recordDate: String(data.recordDate || ''),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        loaded.sort((a, b) => b.recordDate.localeCompare(a.recordDate));
        setRecords(loaded);
        setLoadingData(false);
      },
      (error) => {
        setLoadingData(false);
        setErrorBanner(
          'เกิดข้อผิดพลาดในการดึงข้อมูลรายการรายงาน กรุณาตรวจสอบสิทธิ์การเข้าถึง'
        );
        handleFirestoreError(error, OperationType.LIST, recordsPath);
      }
    );

    const templatesPath = 'report_templates';
    const templatesQuery = query(
      collection(db, templatesPath),
      where('ownerId', '==', user.uid)
    );

    const unsubTemplates = onSnapshot(
      templatesQuery,
      (snapshot) => {
        const loaded: ReportTemplate[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ownerId: String(data.ownerId || ''),
            name: String(data.name || ''),
            description: String(data.description || ''),
            sourceSystemFilter: String(data.sourceSystemFilter || 'ALL'),
            categoryFilter: String(data.categoryFilter || 'ALL'),
            statusFilter: String(data.statusFilter || 'ALL'),
            groupByField:
              (data.groupByField as GroupByDimension) || 'sourceSystem',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        setTemplates(loaded);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, templatesPath);
      }
    );

    return () => {
      unsubRecords();
      unsubTemplates();
    };
  }, [authReady, user]);

  // Distinct options for filters
  const distinctSourceSystems = useMemo(() => {
    const set = new Set<string>([
      'ERP-SAP',
      'POS-Branch',
      'Shopee-OMS',
      'CRM-Sales',
    ]);
    records.forEach((r) => {
      if (r.sourceSystem) set.add(r.sourceSystem);
    });
    return Array.from(set);
  }, [records]);

  const distinctCategories = useMemo(() => {
    const set = new Set<string>([
      'รายได้จากการขาย',
      'รายได้ออนไลน์',
      'รายได้ค่าบริการ',
      'ต้นทุนสินค้า',
      'โลจิสติกส์',
    ]);
    records.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set);
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      if (
        sourceSystemFilter !== 'ALL' &&
        rec.sourceSystem !== sourceSystemFilter
      ) {
        return false;
      }
      if (categoryFilter !== 'ALL' && rec.category !== categoryFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && rec.status !== statusFilter) {
        return false;
      }
      if (startDate && rec.recordDate < startDate) {
        return false;
      }
      if (endDate && rec.recordDate > endDate) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = rec.title.toLowerCase().includes(q);
        const matchRef = rec.referenceCode.toLowerCase().includes(q);
        const matchDept = rec.department.toLowerCase().includes(q);
        const matchSys = rec.sourceSystem.toLowerCase().includes(q);
        if (!matchTitle && !matchRef && !matchDept && !matchSys) return false;
      }
      return true;
    });
  }, [
    records,
    sourceSystemFilter,
    categoryFilter,
    statusFilter,
    startDate,
    endDate,
    searchQuery,
  ]);

  // Summary KPIs
  const summaryKpis = useMemo(() => {
    let totalAmount = 0;
    let completedAmount = 0;
    let pendingAmount = 0;
    let totalQuantity = 0;

    filteredRecords.forEach((r) => {
      if (r.status !== 'cancelled') {
        totalAmount += r.amount;
        totalQuantity += r.quantity;
      }
      if (r.status === 'completed') {
        completedAmount += r.amount;
      } else if (r.status === 'pending') {
        pendingAmount += r.amount;
      }
    });

    const activeCount = filteredRecords.filter(
      (r) => r.status !== 'cancelled'
    ).length;
    const avgAmount = activeCount > 0 ? totalAmount / activeCount : 0;

    return {
      totalAmount,
      completedAmount,
      pendingAmount,
      totalQuantity,
      totalCount: filteredRecords.length,
      avgAmount,
    };
  }, [filteredRecords]);

  // Grouped Aggregation Rows
  const aggregatedRows = useMemo<AggregatedRow[]>(() => {
    const map = new Map<
      string,
      {
        recordCount: number;
        totalQuantity: number;
        totalAmount: number;
        completedAmount: number;
        pendingAmount: number;
      }
    >();

    filteredRecords.forEach((rec) => {
      const rawKey = String(rec[groupByField] || 'ไม่ระบุ');
      const key =
        groupByField === 'status'
          ? STATUS_LABELS[rec.status] || rawKey
          : rawKey;

      const current = map.get(key) || {
        recordCount: 0,
        totalQuantity: 0,
        totalAmount: 0,
        completedAmount: 0,
        pendingAmount: 0,
      };

      current.recordCount += 1;
      if (rec.status !== 'cancelled') {
        current.totalQuantity += rec.quantity;
        current.totalAmount += rec.amount;
      }
      if (rec.status === 'completed') {
        current.completedAmount += rec.amount;
      } else if (rec.status === 'pending') {
        current.pendingAmount += rec.amount;
      }

      map.set(key, current);
    });

    const grandTotal =
      summaryKpis.totalAmount > 0 ? summaryKpis.totalAmount : 1;

    const list: AggregatedRow[] = Array.from(map.entries()).map(
      ([key, val]) => ({
        key,
        ...val,
        sharePercent:
          summaryKpis.totalAmount > 0
            ? (val.totalAmount / grandTotal) * 100
            : 0,
      })
    );

    list.sort((a, b) =>
      sortDirection === 'desc'
        ? b.totalAmount - a.totalAmount
        : a.totalAmount - b.totalAmount
    );

    return list;
  }, [filteredRecords, groupByField, summaryKpis.totalAmount, sortDirection]);

  // Auth Handlers
  const handleSignIn = async () => {
    setErrorBanner(null);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('เข้าสู่ระบบสำเร็จ กำลังเชื่อมต่อฐานข้อมูลรายงานและโปสเตอร์...');
    } catch (error) {
      setErrorBanner(
        error instanceof Error
          ? error.message
          : 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้'
      );
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setExternalResult(null);
    showToast('ออกจากระบบเรียบร้อยแล้ว');
  };

  // Seed / Sync Multi-System Sample Data
  const handleSyncSampleSystems = async () => {
    if (!user) return;
    setActionBusy(true);
    setErrorBanner(null);
    const path = 'report_records';

    try {
      const batch = writeBatch(db);
      MULTI_SYSTEM_SAMPLE_RECORDS.forEach((item) => {
        const newDocRef = doc(collection(db, path));
        batch.set(newDocRef, {
          ownerId: user.uid,
          sourceSystem: sanitizeString(
            item.sourceSystem,
            BLUEPRINT_CONSTRAINTS.RECORD.SOURCE_SYSTEM_MAX,
            'EXTERNAL-SYS'
          ),
          referenceCode: sanitizeString(
            item.referenceCode,
            BLUEPRINT_CONSTRAINTS.RECORD.REFERENCE_CODE_MAX,
            'REF-001'
          ),
          title: sanitizeString(
            item.title,
            BLUEPRINT_CONSTRAINTS.RECORD.TITLE_MAX,
            'รายการข้อมูล'
          ),
          category: sanitizeString(
            item.category,
            BLUEPRINT_CONSTRAINTS.RECORD.CATEGORY_MAX,
            'ทั่วไป'
          ),
          department: sanitizeString(
            item.department,
            BLUEPRINT_CONSTRAINTS.RECORD.DEPARTMENT_MAX,
            'สำนักงานใหญ่'
          ),
          amount: Math.min(
            Math.max(0, Number(item.amount) || 0),
            BLUEPRINT_CONSTRAINTS.RECORD.AMOUNT_MAX
          ),
          quantity: Math.min(
            Math.max(0, Number(item.quantity) || 0),
            BLUEPRINT_CONSTRAINTS.RECORD.QUANTITY_MAX
          ),
          status: BLUEPRINT_CONSTRAINTS.RECORD.STATUS_VALUES.includes(
            item.status
          )
            ? item.status
            : 'completed',
          recordDate: BLUEPRINT_CONSTRAINTS.RECORD.DATE_PATTERN.test(
            item.recordDate
          )
            ? item.recordDate
            : '2026-10-19',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      showToast('ซิงค์ข้อมูลตัวอย่างเข้าสู่คลังรายงานหลักสำเร็จ');
      setActiveTab('dashboard');
    } catch (error) {
      setActionBusy(false);
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setActionBusy(false);
    }
  };

  // Create Single Record
  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const cleanTitle = sanitizeString(
      newTitle,
      BLUEPRINT_CONSTRAINTS.RECORD.TITLE_MAX
    );
    if (!cleanTitle) {
      setErrorBanner('กรุณาระบุชื่อรายการหรือรายละเอียดธุรกรรม');
      return;
    }

    const parsedAmount = Math.min(
      Math.max(0, Number(newAmount) || 0),
      BLUEPRINT_CONSTRAINTS.RECORD.AMOUNT_MAX
    );
    const parsedQuantity = Math.min(
      Math.max(0, Number(newQuantity) || 0),
      BLUEPRINT_CONSTRAINTS.RECORD.QUANTITY_MAX
    );
    const validDate = BLUEPRINT_CONSTRAINTS.RECORD.DATE_PATTERN.test(
      newRecordDate
    )
      ? newRecordDate
      : '2026-10-19';

    setActionBusy(true);
    setErrorBanner(null);
    const path = 'report_records';

    try {
      await addDoc(collection(db, path), {
        ownerId: user.uid,
        sourceSystem: sanitizeString(
          newSourceSystem,
          BLUEPRINT_CONSTRAINTS.RECORD.SOURCE_SYSTEM_MAX,
          'ERP-SAP'
        ),
        referenceCode: sanitizeString(
          newReferenceCode,
          BLUEPRINT_CONSTRAINTS.RECORD.REFERENCE_CODE_MAX,
          `REF-${Date.now().toString().slice(-6)}`
        ),
        title: cleanTitle,
        category: sanitizeString(
          newCategory,
          BLUEPRINT_CONSTRAINTS.RECORD.CATEGORY_MAX,
          'รายได้จากการขาย'
        ),
        department: sanitizeString(
          newDepartment,
          BLUEPRINT_CONSTRAINTS.RECORD.DEPARTMENT_MAX,
          'สำนักงานใหญ่'
        ),
        amount: parsedAmount,
        quantity: parsedQuantity,
        status: newStatus,
        recordDate: validDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setNewTitle('');
      setNewReferenceCode(`REF-${Date.now().toString().slice(-5)}`);
      showToast('บันทึกรายการเข้าสู่ฐานข้อมูล Firebase เรียบร้อยแล้ว');
      setActiveTab('dashboard');
    } catch (error) {
      setActionBusy(false);
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setActionBusy(false);
    }
  };

  // Batch JSON Import
  const handleBatchJsonImport = async () => {
    if (!user) return;
    setErrorBanner(null);

    let parsedArray: SeedRecordInput[] = [];
    try {
      const raw = JSON.parse(jsonInputText);
      if (!Array.isArray(raw) || raw.length === 0) {
        setErrorBanner(
          'รูปแบบ JSON ต้องเป็น Array ของรายการข้อมูลอย่างน้อย 1 รายการ'
        );
        return;
      }
      parsedArray = raw.slice(0, 50);
    } catch {
      setErrorBanner(
        'รูปแบบ JSON ไม่ถูกต้อง กรุณาตรวจสอบเครื่องหมายปีกกาและคอมมา'
      );
      return;
    }

    setActionBusy(true);
    const path = 'report_records';
    try {
      const batch = writeBatch(db);
      parsedArray.forEach((item, idx) => {
        const docRef = doc(collection(db, path));
        const statusCandidate = String(
          item.status || 'completed'
        ) as RecordStatus;
        const safeStatus: RecordStatus =
          BLUEPRINT_CONSTRAINTS.RECORD.STATUS_VALUES.includes(statusCandidate)
            ? statusCandidate
            : 'completed';
        const dateCandidate = String(item.recordDate || '2026-10-19');
        const safeDate = BLUEPRINT_CONSTRAINTS.RECORD.DATE_PATTERN.test(
          dateCandidate
        )
          ? dateCandidate
          : '2026-10-19';

        batch.set(docRef, {
          ownerId: user.uid,
          sourceSystem: sanitizeString(
            String(item.sourceSystem || 'EXTERNAL-FIREBASE'),
            BLUEPRINT_CONSTRAINTS.RECORD.SOURCE_SYSTEM_MAX,
            'EXTERNAL-FIREBASE'
          ),
          referenceCode: sanitizeString(
            String(item.referenceCode || `IMP-${idx + 1}`),
            BLUEPRINT_CONSTRAINTS.RECORD.REFERENCE_CODE_MAX,
            `IMP-${idx + 1}`
          ),
          title: sanitizeString(
            String(item.title || 'ข้อมูลนำเข้าจากระบบภายนอก'),
            BLUEPRINT_CONSTRAINTS.RECORD.TITLE_MAX,
            'ข้อมูลนำเข้าจากระบบภายนอก'
          ),
          category: sanitizeString(
            String(item.category || 'ทั่วไป'),
            BLUEPRINT_CONSTRAINTS.RECORD.CATEGORY_MAX,
            'ทั่วไป'
          ),
          department: sanitizeString(
            String(item.department || 'ส่วนกลาง'),
            BLUEPRINT_CONSTRAINTS.RECORD.DEPARTMENT_MAX,
            'ส่วนกลาง'
          ),
          amount: Math.min(
            Math.max(0, Number(item.amount) || 0),
            BLUEPRINT_CONSTRAINTS.RECORD.AMOUNT_MAX
          ),
          quantity: Math.min(
            Math.max(0, Number(item.quantity) || 1),
            BLUEPRINT_CONSTRAINTS.RECORD.QUANTITY_MAX
          ),
          status: safeStatus,
          recordDate: safeDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      showToast(
        `นำเข้าข้อมูลจำนวน ${parsedArray.length} รายการเข้าสู่ Firestore สำเร็จ`
      );
      setActiveTab('dashboard');
    } catch (error) {
      setActionBusy(false);
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setActionBusy(false);
    }
  };

  // CSV / JSON File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      if (file.name.endsWith('.json')) {
        setJsonInputText(content);
        showToast(
          `โหลดไฟล์ ${file.name} แล้ว กดปุ่ม "นำเข้าข้อมูลเข้าสู่ Firestore" เพื่อยืนยัน`
        );
      } else if (file.name.endsWith('.csv')) {
        const lines = content
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length < 2) {
          setErrorBanner(
            'ไฟล์ CSV ต้องมีบรรทัดหัวตารางและข้อมูลอย่างน้อย 1 แถว'
          );
          return;
        }
        const headers = lines[0]
          .split(',')
          .map((h) => h.trim().replace(/^"|"$/g, ''));
        const converted = lines.slice(1).map((line, idx) => {
          const cols = line
            .split(',')
            .map((c) => c.trim().replace(/^"|"$/g, ''));
          const rowObj: Record<string, string> = {};
          headers.forEach((h, i) => {
            rowObj[h] = cols[i] || '';
          });
          return {
            sourceSystem:
              rowObj.sourceSystem || rowObj.system || 'CSV-IMPORT',
            referenceCode:
              rowObj.referenceCode || rowObj.ref || `CSV-${idx + 1}`,
            title:
              rowObj.title ||
              rowObj.description ||
              `รายการนำเข้า #${idx + 1}`,
            category: rowObj.category || 'รายได้จากการขาย',
            department: rowObj.department || 'ส่วนกลาง',
            amount: Number(rowObj.amount || 0),
            quantity: Number(rowObj.quantity || 1),
            status: (rowObj.status as RecordStatus) || 'completed',
            recordDate: rowObj.recordDate || rowObj.date || '2026-10-19',
          };
        });
        setJsonInputText(JSON.stringify(converted, null, 2));
        showToast(
          `แปลงไฟล์ CSV (${converted.length} รายการ) เป็น JSON พร้อมนำเข้าแล้ว`
        );
      }
    };
    reader.readAsText(file);
  };

  // Update Record Status
  const handleStatusChange = async (
    record: ReportRecord,
    nextStatus: RecordStatus
  ) => {
    if (!user || record.status !== 'pending') return;
    const path = `report_records/${record.id}`;
    try {
      await updateDoc(doc(db, 'report_records', record.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      showToast(
        `อัปเดตสถานะเอกสาร ${record.referenceCode} เป็น "${STATUS_LABELS[nextStatus]}"`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  // Open Edit Modal for Pending Record
  const openEditModal = (rec: ReportRecord) => {
    setEditingRecord(rec);
    setEditTitle(rec.title);
    setEditCategory(rec.category);
    setEditDepartment(rec.department);
    setEditAmount(String(rec.amount));
    setEditQuantity(String(rec.quantity));
    setEditDate(rec.recordDate);
  };

  // Save Edited Pending Record
  const handleSaveEditRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingRecord || editingRecord.status !== 'pending') return;
    const path = `report_records/${editingRecord.id}`;

    try {
      await updateDoc(doc(db, 'report_records', editingRecord.id), {
        title: sanitizeString(
          editTitle,
          BLUEPRINT_CONSTRAINTS.RECORD.TITLE_MAX,
          editingRecord.title
        ),
        category: sanitizeString(
          editCategory,
          BLUEPRINT_CONSTRAINTS.RECORD.CATEGORY_MAX,
          editingRecord.category
        ),
        department: sanitizeString(
          editDepartment,
          BLUEPRINT_CONSTRAINTS.RECORD.DEPARTMENT_MAX,
          editingRecord.department
        ),
        amount: Math.min(
          Math.max(0, Number(editAmount) || 0),
          BLUEPRINT_CONSTRAINTS.RECORD.AMOUNT_MAX
        ),
        quantity: Math.min(
          Math.max(0, Number(editQuantity) || 0),
          BLUEPRINT_CONSTRAINTS.RECORD.QUANTITY_MAX
        ),
        recordDate: BLUEPRINT_CONSTRAINTS.RECORD.DATE_PATTERN.test(editDate)
          ? editDate
          : editingRecord.recordDate,
        updatedAt: serverTimestamp(),
      });
      setEditingRecord(null);
      showToast('แก้ไขข้อมูลรายการที่รอดำเนินการสำเร็จ');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  // Delete Record
  const handleDeleteRecord = async (recordId: string) => {
    if (!user) return;
    const path = `report_records/${recordId}`;
    try {
      await deleteDoc(doc(db, 'report_records', recordId));
      showToast('ลบรายการออกจากฐานข้อมูลแล้ว');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  // Save Report Template
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const cleanName = sanitizeString(
      templateName,
      BLUEPRINT_CONSTRAINTS.TEMPLATE.NAME_MAX
    );
    if (!cleanName) {
      setErrorBanner('กรุณาตั้งชื่อเทมเพลตรายงาน');
      return;
    }

    const path = 'report_templates';
    try {
      await addDoc(collection(db, path), {
        ownerId: user.uid,
        name: cleanName,
        description: sanitizeString(
          templateDesc,
          BLUEPRINT_CONSTRAINTS.TEMPLATE.DESCRIPTION_MAX,
          'เทมเพลตตัวกรองรายงานมาตรฐาน'
        ),
        sourceSystemFilter: sanitizeString(
          sourceSystemFilter,
          BLUEPRINT_CONSTRAINTS.TEMPLATE.FILTER_MAX,
          'ALL'
        ),
        categoryFilter: sanitizeString(
          categoryFilter,
          BLUEPRINT_CONSTRAINTS.TEMPLATE.FILTER_MAX,
          'ALL'
        ),
        statusFilter: sanitizeString(
          statusFilter,
          BLUEPRINT_CONSTRAINTS.TEMPLATE.STATUS_FILTER_MAX,
          'ALL'
        ),
        groupByField,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTemplateName('');
      setTemplateDesc('');
      showToast('บันทึกเทมเพลตรายงานสำเร็จ');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleApplyTemplate = (tpl: ReportTemplate) => {
    setSourceSystemFilter(tpl.sourceSystemFilter);
    setCategoryFilter(tpl.categoryFilter);
    setStatusFilter(tpl.statusFilter);
    setGroupByField(tpl.groupByField);
    setActiveTab('dashboard');
    showToast(`เรียกใช้เทมเพลต "${tpl.name}" เรียบร้อยแล้ว`);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!user) return;
    const path = `report_templates/${templateId}`;
    try {
      await deleteDoc(doc(db, 'report_templates', templateId));
      showToast('ลบเทมเพลตรายงานแล้ว');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  // Export Warehouse CSV
  const handleExportCsv = () => {
    const headers = [
      'รหัสอ้างอิง (Reference)',
      'ระบบต้นทาง (Source System)',
      'วันที่ (Date)',
      'ชื่อรายการ (Title)',
      'หมวดหมู่ (Category)',
      'แผนก/สาขา (Department)',
      'จำนวนหน่วย (Quantity)',
      'มูลค่า (Amount THB)',
      'สถานะ (Status)',
    ];

    const rows = filteredRecords.map((r) => [
      `"${r.referenceCode.replace(/"/g, '""')}"`,
      `"${r.sourceSystem.replace(/"/g, '""')}"`,
      `"${r.recordDate}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.category.replace(/"/g, '""')}"`,
      `"${r.department.replace(/"/g, '""')}"`,
      r.quantity,
      r.amount,
      `"${STATUS_LABELS[r.status] || r.status}"`,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `firebase_report_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('ส่งออกไฟล์รายงาน CSV สำหรับเปิดใน Excel สำเร็จ');
  };

  const resetFilters = () => {
    setSourceSystemFilter('ALL');
    setCategoryFilter('ALL');
    setStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/80 text-slate-900">
      {/* Clean, Streamlined Top Bar */}
      <header className="no-print flex items-center justify-between gap-4 px-4 sm:px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
            DOE
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 truncate">
              ระบบรายงานผลการปฏิบัติงานศูนย์บริการใบอนุญาตทำงานคนต่างด้าว
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 truncate">
              <span>กรมการจัดหางาน</span>
              <span aria-hidden="true">·</span>
              <span>
                ข้อมูลรายงานทั้งหมด{' '}
                <strong className="font-mono text-slate-800">
                  {baseDoeDataset.length}
                </strong>{' '}
                รายการ
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button
            type="button"
            onClick={handleFetchExternalDatabase}
            disabled={externalLoading}
            title="ระบบซิงค์ข้อมูลแบบ Real-time อัตโนมัติเมื่อฐานข้อมูลมีการเปลี่ยนแปลง (คลิกเพื่อรีเฟรชด้วยตนเอง)"
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${externalLoading ? 'animate-spin' : ''}`}
            />
            <span>
              {externalLoading
                ? 'กำลังซิงค์ข้อมูล...'
                : 'ซิงค์อัตโนมัติ (Real-time)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (showDbSettings) {
                setShowDbSettings(false);
              } else {
                setDbPasscodeInput('');
                setDbPasscodeError(null);
                setShowDbPasscodeModal(true);
              }
            }}
            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
              showDbSettings
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden md:inline">ตั้งค่าฐานข้อมูล</span>
          </button>
        </div>
      </header>

      {/* Database Settings Passcode Modal */}
      {showDbPasscodeModal && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-lg">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                ยืนยันรหัสผ่านตั้งค่าฐานข้อมูล
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              กรุณากรอกรหัสผ่านเพื่อเข้าสู่เมนูตั้งค่าการเชื่อมต่อฐานข้อมูล
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (dbPasscodeInput.trim() === '0841543524') {
                  setShowDbPasscodeModal(false);
                  setDbPasscodeInput('');
                  setDbPasscodeError(null);
                  setShowDbSettings(true);
                } else {
                  setDbPasscodeError('รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
                }
              }}
              className="space-y-3"
            >
              <div>
                <input
                  type="password"
                  autoFocus
                  value={dbPasscodeInput}
                  onChange={(e) => {
                    setDbPasscodeInput(e.target.value);
                    if (dbPasscodeError) setDbPasscodeError(null);
                  }}
                  placeholder="กรอกรหัสผ่าน..."
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                />
                {dbPasscodeError && (
                  <p className="text-[11px] font-medium text-red-600 mt-1.5">
                    {dbPasscodeError}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowDbPasscodeModal(false);
                    setDbPasscodeInput('');
                    setDbPasscodeError(null);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  ยืนยันรหัสผ่าน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feedback & Error Toast Strip */}
      {feedbackMsg && (
        <div className="no-print bg-slate-900 text-white px-6 py-2 text-xs font-medium flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-400 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            ปิดข้อความ
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="no-print bg-red-50 border-b border-red-200 text-red-800 px-6 py-2.5 text-xs font-medium flex items-center justify-between">
          <span>ข้อผิดพลาด: {errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-red-700 underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            รับทราบ
          </button>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 w-full px-3 sm:px-6 py-4">
        <>
          {activeTab === 'external' && (
              <div className="space-y-5">
                {/* Collapsible Database Connection Settings Panel (Hidden by default to keep UI clean) */}
                {showDbSettings && (
                  <section className="no-print bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-blue-600" />
                        <h2 className="text-sm font-bold text-slate-900">
                          ตั้งค่าการเชื่อมต่อฐานข้อมูล (Firestore Connection)
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDbSettings(false)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                      >
                        ซ่อนหน้าต่างนี้
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                      <div className="lg:col-span-6">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Firestore REST Endpoint URL
                        </label>
                        <input
                          type="text"
                          value={externalUrl}
                          onChange={(e) =>
                            handleExternalUrlChange(e.target.value)
                          }
                          className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                        />
                      </div>

                      <div className="lg:col-span-3">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Database ID
                        </label>
                        <input
                          type="text"
                          value={externalDbId}
                          onChange={(e) => setExternalDbId(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                        />
                      </div>

                      <div className="lg:col-span-3">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          ชื่อ Collection
                        </label>
                        <input
                          type="text"
                          value={externalCollection}
                          onChange={(e) =>
                            setExternalCollection(e.target.value)
                          }
                          className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                        />
                      </div>
                    </div>

                    {externalResult && (
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <div>
                          สถานะ: <strong className="text-slate-800">{externalResult.strategyUsed}</strong> · พบเอกสาร{' '}
                          <strong className="font-mono text-slate-900">
                            {externalResult.documents.length}
                          </strong>{' '}
                          รายการ
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleExportExternalJson}
                            disabled={filteredExternalDocs.length === 0}
                            className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 cursor-pointer"
                          >
                            ดาวน์โหลด JSON ทั้งหมด
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* Permission Denied Notice (Only shown if error occurs and user opens DB settings) */}
                {showDbSettings && externalResult?.errorMessage && (
                  <section className="no-print bg-amber-50/90 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          หมายเหตุ: ฐานข้อมูล {externalDbId} จำกัดสิทธิ์การอ่านจากภายนอก ({externalResult.errorMessage})
                        </p>
                        <p className="text-amber-800 mt-0.5">
                          คุณสามารถคลิกปุ่ม <strong>"วางข้อมูล JSON จากฐานข้อมูล"</strong> บนแถบด้านบนโปสเตอร์เพื่อนำเข้าข้อมูลจริงมาแสดงผลได้ทันที
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {/* TOP FILTER CONTROL BAR (CLEAN 3-SELECTOR + QUICK SWITCHER) */}
                <section className="no-print bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
                  {/* 3-Box Filter Row matching user reference screenshot */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                    {/* Box 1: รอบ/ช่วงวันที่ */}
                    <div className="lg:col-span-5 relative flex items-center gap-2.5 bg-slate-50/70 hover:bg-white border border-slate-300/90 hover:border-blue-500 rounded-xl px-3.5 py-2.5 transition-colors">
                      <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                        รอบ/ช่วงวันที่:
                      </span>
                      <select
                        aria-label="รอบ/ช่วงวันที่"
                        value={doeDateFilter}
                        onChange={(e) => {
                          const nextDate = e.target.value;
                          setDoeDateFilter(nextDate);
                          setDoeDisplayMode('filtered_summary');
                        }}
                        className="w-full appearance-none bg-transparent pr-6 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer truncate"
                      >
                        <option value="ALL">
                          📊 ภาพรวมสะสมทั้งหมด (รายงานทั้งหมด{' '}
                          {baseDoeDataset.length} รายการ)
                        </option>
                        {doeDateOptions.map((opt) => (
                          <option key={opt.dateThai} value={opt.dateThai}>
                            📅 {opt.dateThai} (รายงาน {opt.count} รายการ)
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-500 pointer-events-none shrink-0" />
                    </div>

                    {/* Box 2: ภูมิภาค (Locked to เฉพาะกิจ (Mobile Unit)) */}
                    <div className="lg:col-span-4 relative flex items-center gap-2.5 bg-slate-50/70 hover:bg-white border border-slate-300/90 hover:border-blue-500 rounded-xl px-3.5 py-2.5 transition-colors">
                      <Filter className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                        ภูมิภาค:
                      </span>
                      <select
                        aria-label="ภูมิภาค"
                        value={doeRegionFilter}
                        onChange={(e) => {
                          setDoeRegionFilter(e.target.value);
                          setDoeDisplayMode('filtered_summary');
                        }}
                        className="w-full appearance-none bg-transparent pr-6 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer truncate"
                      >
                        <option value="เฉพาะกิจ (Mobile Unit)">
                          เฉพาะกิจ (Mobile Unit)
                        </option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-500 pointer-events-none shrink-0" />
                    </div>

                    {/* Box 3: เลือกจังหวัด (Locked to สมุทรสาคร only) */}
                    <div className="lg:col-span-3 relative flex items-center gap-2.5 bg-slate-50/70 hover:bg-white border border-slate-300/90 hover:border-blue-500 rounded-xl px-3.5 py-2.5 transition-colors">
                      <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                        เลือกจังหวัด:
                      </span>
                      <select
                        aria-label="เลือกจังหวัด"
                        value="สมุทรสาคร"
                        onChange={(e) => {
                          setDoeProvinceFilter(e.target.value);
                          setDoeDisplayMode('filtered_summary');
                        }}
                        className="w-full appearance-none bg-transparent pr-6 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer truncate"
                      >
                        <option value="สมุทรสาคร">สมุทรสาคร</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-500 pointer-events-none shrink-0" />
                    </div>
                  </div>
                </section>

                {/* MAIN FOCUS: THE OFFICIAL DOE EXECUTIVE SUMMARY POSTER */}
                <section>
                  {doeDisplayMode === 'all' && doePostersList.length > 0 ? (
                    <div className="space-y-8">
                      {doePostersList.map((item) => (
                        <DoeReportPoster
                          key={item.docId}
                          data={item}
                          onInspectJson={(raw) => setSelectedRawDoc(raw)}
                          customFieldMap={customDoeFieldMap}
                          onUpdateCustomFieldMap={setCustomDoeFieldMap}
                        />
                      ))}
                    </div>
                  ) : doeDisplayMode === 'single' ? (
                    <DoeReportPoster
                      data={activeSingleDoePoster}
                      onInspectJson={(raw) => setSelectedRawDoc(raw)}
                      customFieldMap={customDoeFieldMap}
                      onUpdateCustomFieldMap={setCustomDoeFieldMap}
                    />
                  ) : (
                    <DoeReportPoster
                      data={combinedDoePoster}
                      onInspectJson={(raw) => setSelectedRawDoc(raw)}
                      customFieldMap={customDoeFieldMap}
                      onUpdateCustomFieldMap={setCustomDoeFieldMap}
                    />
                  )}
                </section>
              </div>
            )}

            {/* TAB 1: CONSOLIDATED REPORT WAREHOUSE DASHBOARD */}
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                <section className="no-print bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-500" />
                      <h2 className="text-sm font-semibold text-slate-900">
                        ตัวกรองข้อมูลและการจัดกลุ่มคลังรายงานรวม
                      </h2>
                    </div>

                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setSourceSystemFilter('ALL')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          sourceSystemFilter === 'ALL'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ทุกระบบต้นทาง
                      </button>
                      {distinctSourceSystems.map((sys) => (
                        <button
                          key={sys}
                          type="button"
                          onClick={() => setSourceSystemFilter(sys)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            sourceSystemFilter === sys
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {sys}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        ค้นหารหัสอ้างอิง / ชื่อรายการ / แผนก
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="เช่น SAP-INV, สยามพารากอน, B2B..."
                          className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        หมวดหมู่รายงาน
                      </label>
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                      >
                        <option value="ALL">ทุกหมวดหมู่</option>
                        {distinctCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        สถานะรายการ
                      </label>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                      >
                        <option value="ALL">ทุกสถานะ</option>
                        <option value="completed">สำเร็จแล้ว (Completed)</option>
                        <option value="pending">รอดำเนินการ (Pending)</option>
                        <option value="cancelled">ยกเลิกรายการ (Cancelled)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        ตั้งแต่วันที่
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:bg-white focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        ถึงวันที่
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:bg-white focus:border-blue-600"
                        />
                        {(sourceSystemFilter !== 'ALL' ||
                          categoryFilter !== 'ALL' ||
                          statusFilter !== 'ALL' ||
                          startDate ||
                          endDate ||
                          searchQuery) && (
                          <button
                            type="button"
                            onClick={resetFilters}
                            className="px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            ล้างค่า
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* 4-Column Executive KPI Strip */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs text-slate-500 mb-1">
                      มูลค่ารวมสุทธิ (ไม่รวมรายการยกเลิก)
                    </div>
                    <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                      {formatCurrency(summaryKpis.totalAmount)}
                    </div>
                    <div className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                      <span>
                        สำเร็จแล้ว {formatCurrency(summaryKpis.completedAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs text-slate-500 mb-1">
                      ยอดรอดำเนินการตรวจสอบ (Pending)
                    </div>
                    <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
                      {formatCurrency(summaryKpis.pendingAmount)}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      <span>สามารถกดอนุมัติหรือแก้ไขได้ในตาราง</span>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs text-slate-500 mb-1">
                      จำนวนรายการที่ดึงพบทั้งหมด
                    </div>
                    <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                      {formatNumber(summaryKpis.totalCount)} รายการ
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      <span>
                        จำนวนหน่วยรวม {formatNumber(summaryKpis.totalQuantity)}{' '}
                        หน่วย
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs text-slate-500 mb-1">
                      มูลค่าเฉลี่ยต่อรายการ (Average Ticket)
                    </div>
                    <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                      {formatCurrency(summaryKpis.avgAmount)}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      <span>คำนวณจากรายการที่ใช้งานอยู่</span>
                    </div>
                  </div>
                </section>

                {/* Empty State if no records in Firestore */}
                {!loadingData && records.length === 0 ? (
                  <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                    <Database className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-slate-900 mb-1">
                      ยังไม่มีข้อมูลในคลังรายงานรวม (report_records)
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
                      คุณสามารถซิงค์ข้อมูลจากแท็บ "แกลเลอรีโปสเตอร์ & ฐานข้อมูลภายนอก" หรือกดปุ่มด้านล่างเพื่อโหลดข้อมูลตัวอย่างจาก 4 ระบบต้นทางได้ทันที
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={handleSyncSampleSystems}
                        disabled={actionBusy}
                        className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        ซิงค์ข้อมูลตัวอย่างจาก 4 ระบบทันที
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('external')}
                        className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        ไปที่หน้าแกลเลอรีโปสเตอร์
                      </button>
                    </div>
                  </section>
                ) : (
                  <>
                    {/* Grouped Dimension Summary Table */}
                    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            ตารางสรุปยอดตามมิติข้อมูล: {GROUP_BY_LABELS[groupByField]}
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            จัดกลุ่มและคำนวณสัดส่วนอัตโนมัติจากรายการที่ผ่านตัวกรองทั้งหมด{' '}
                            {filteredRecords.length} รายการ
                          </p>
                        </div>

                        <div className="no-print flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-500">
                            จัดกลุ่มตาม:
                          </span>
                          <select
                            value={groupByField}
                            onChange={(e) =>
                              setGroupByField(
                                e.target.value as GroupByDimension
                              )
                            }
                            className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                          >
                            <option value="sourceSystem">
                              ระบบต้นทาง (Source System)
                            </option>
                            <option value="category">
                              หมวดหมู่รายงาน (Category)
                            </option>
                            <option value="department">
                              แผนก / สาขา (Department)
                            </option>
                            <option value="status">สถานะรายการ (Status)</option>
                            <option value="recordDate">
                              วันที่รายการ (Record Date)
                            </option>
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              setSortDirection((prev) =>
                                prev === 'desc' ? 'asc' : 'desc'
                              )
                            }
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <ArrowDownUp className="w-3.5 h-3.5" />
                            {sortDirection === 'desc'
                              ? 'มูลค่ามากไปน้อย'
                              : 'มูลค่าน้อยไปมาก'}
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                              <th className="py-3 px-6">
                                {GROUP_BY_LABELS[groupByField]}
                              </th>
                              <th className="py-3 px-4 text-right">
                                จำนวนรายการ
                              </th>
                              <th className="py-3 px-4 text-right">
                                จำนวนหน่วย
                              </th>
                              <th className="py-3 px-4 text-right">
                                ยอดสำเร็จแล้ว
                              </th>
                              <th className="py-3 px-4 text-right">
                                ยอดรอดำเนินการ
                              </th>
                              <th className="py-3 px-4 text-right">
                                มูลค่ารวมสุทธิ
                              </th>
                              <th className="py-3 px-6 w-48">
                                สัดส่วนมูลค่า (%)
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-xs">
                            {aggregatedRows.map((row) => (
                              <tr
                                key={row.key}
                                className="hover:bg-slate-50/80 transition-colors"
                              >
                                <td className="py-3 px-6 font-semibold text-slate-900">
                                  {row.key}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                                  {formatNumber(row.recordCount)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                                  {formatNumber(row.totalQuantity)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                                  {formatCurrency(row.completedAmount)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700">
                                  {formatCurrency(row.pendingAmount)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                                  {formatCurrency(row.totalAmount)}
                                </td>
                                <td className="py-3 px-6">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-100 rounded-xs overflow-hidden">
                                      <div
                                        className="h-full bg-blue-600"
                                        style={{
                                          width: `${Math.min(
                                            100,
                                            Math.max(2, row.sharePercent)
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="font-mono tabular-nums text-slate-600 w-12 text-right">
                                      {row.sharePercent.toFixed(1)}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {/* Detailed Records Data Grid */}
                    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            รายการธุรกรรมรายเอกสาร (Detailed Transaction Ledger)
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            รายการสถานะ "รอดำเนินการ" สามารถกดยืนยันสถานะหรือแก้ไขข้อมูลได้โดยตรง
                          </p>
                        </div>

                        <div className="no-print flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSyncSampleSystems}
                            disabled={actionBusy}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            โหลดข้อมูลตัวอย่าง 4 ระบบ
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('sync')}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            เพิ่ม / นำเข้าข้อมูล
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                              <th className="py-2.5 px-4">วันที่เอกสาร</th>
                              <th className="py-2.5 px-4">
                                ระบบต้นทาง · รหัสอ้างอิง
                              </th>
                              <th className="py-2.5 px-4">รายละเอียดรายการ</th>
                              <th className="py-2.5 px-4">หมวดหมู่ · แผนก</th>
                              <th className="py-2.5 px-4 text-right">จำนวน</th>
                              <th className="py-2.5 px-4 text-right">
                                มูลค่า (THB)
                              </th>
                              <th className="py-2.5 px-4">สถานะ</th>
                              <th className="no-print py-2.5 px-4 text-right">
                                จัดการ
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-xs">
                            {filteredRecords.map((rec) => (
                              <tr
                                key={rec.id}
                                className="hover:bg-slate-50/80 transition-colors h-10"
                              >
                                <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                  {rec.recordDate}
                                </td>
                                <td className="py-2.5 px-4 whitespace-nowrap">
                                  <span className="font-semibold text-slate-900">
                                    {rec.sourceSystem}
                                  </span>
                                  <span
                                    className="mx-1.5 text-slate-400"
                                    aria-hidden="true"
                                  >
                                    ·
                                  </span>
                                  <span className="font-mono tabular-nums text-slate-600">
                                    {rec.referenceCode}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-slate-900 font-medium max-w-xs truncate">
                                  {rec.title}
                                </td>
                                <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                                  <span>{rec.category}</span>
                                  <span
                                    className="mx-1.5 text-slate-400"
                                    aria-hidden="true"
                                  >
                                    ·
                                  </span>
                                  <span className="text-slate-500">
                                    {rec.department}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                                  {formatNumber(rec.quantity)}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                                  {formatCurrency(rec.amount)}
                                </td>
                                <td className="py-2.5 px-4 whitespace-nowrap">
                                  {rec.status === 'completed' && (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      สำเร็จแล้ว
                                    </span>
                                  )}
                                  {rec.status === 'pending' && (
                                    <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                                      <Clock className="w-3.5 h-3.5" />
                                      รอดำเนินการ
                                    </span>
                                  )}
                                  {rec.status === 'cancelled' && (
                                    <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                                      <XCircle className="w-3.5 h-3.5" />
                                      ยกเลิกรายการ
                                    </span>
                                  )}
                                </td>
                                <td className="no-print py-2.5 px-4 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-2">
                                    {rec.status === 'pending' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleStatusChange(rec, 'completed')
                                          }
                                          title="ยืนยันสำเร็จ"
                                          className="text-emerald-700 hover:underline font-medium cursor-pointer"
                                        >
                                          อนุมัติ
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openEditModal(rec)}
                                          title="แก้ไขรายการ"
                                          className="text-slate-600 hover:text-slate-900 cursor-pointer"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleStatusChange(rec, 'cancelled')
                                          }
                                          title="ยกเลิกรายการ"
                                          className="text-amber-700 hover:underline cursor-pointer"
                                        >
                                          ยกเลิก
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRecord(rec.id)}
                                      title="ลบรายการ"
                                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}

            {/* TAB 2: SAVED REPORT TEMPLATES */}
            {activeTab === 'templates' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-6 h-fit">
                  <div className="flex items-center gap-2 mb-2">
                    <FolderKanban className="w-4 h-4 text-blue-600" />
                    <h2 className="text-base font-semibold text-slate-900">
                      บันทึกเทมเพลตรายงานใหม่
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                    บันทึกเงื่อนไขตัวกรองและการจัดกลุ่มรายงานที่ใช้บ่อยไว้ใน Collection{' '}
                    <code className="font-mono text-slate-700">
                      report_templates
                    </code>{' '}
                    เพื่อกดเรียกดูรายงานได้ในคลิกเดียว
                  </p>

                  <form onSubmit={handleCreateTemplate} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        ชื่อเทมเพลตรายงาน (สูงสุด 120 ตัวอักษร)
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={BLUEPRINT_CONSTRAINTS.TEMPLATE.NAME_MAX}
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="เช่น รายงานสรุปจากระบบภายนอกประจำเดือน"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        คำอธิบายเพิ่มเติม
                      </label>
                      <textarea
                        rows={2}
                        maxLength={
                          BLUEPRINT_CONSTRAINTS.TEMPLATE.DESCRIPTION_MAX
                        }
                        value={templateDesc}
                        onChange={(e) => setTemplateDesc(e.target.value)}
                        placeholder="ระบุวัตถุประสงค์ของรายงาน เช่น ใช้ประชุมประจำสัปดาห์"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          กรองระบบต้นทาง
                        </label>
                        <select
                          value={sourceSystemFilter}
                          onChange={(e) =>
                            setSourceSystemFilter(e.target.value)
                          }
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <option value="ALL">ทุกระบบ (ALL)</option>
                          {distinctSourceSystems.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          กรองสถานะ
                        </label>
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <option value="ALL">ทุกสถานะ (ALL)</option>
                          <option value="completed">สำเร็จแล้ว</option>
                          <option value="pending">รอดำเนินการ</option>
                          <option value="cancelled">ยกเลิกรายการ</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        มิติการจัดกลุ่ม (Group By)
                      </label>
                      <select
                        value={groupByField}
                        onChange={(e) =>
                          setGroupByField(e.target.value as GroupByDimension)
                        }
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        <option value="sourceSystem">
                          ระบบต้นทาง (Source System)
                        </option>
                        <option value="category">
                          หมวดหมู่รายงาน (Category)
                        </option>
                        <option value="department">
                          แผนก / สาขา (Department)
                        </option>
                        <option value="status">สถานะรายการ (Status)</option>
                        <option value="recordDate">
                          วันที่รายการ (Record Date)
                        </option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                      บันทึกเทมเพลตรายงาน
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="text-base font-semibold text-slate-900 mb-1">
                    รายการเทมเพลตรายงานที่บันทึกไว้ ({templates.length})
                  </h2>
                  <p className="text-xs text-slate-500 mb-6">
                    คลิก "เรียกดูรายงาน" เพื่อนำค่าตัวกรองไปแสดงผลที่หน้าคลังรายงานรวมทันที
                  </p>

                  {templates.length === 0 ? (
                    <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg">
                      <p className="text-xs text-slate-500">
                        ยังไม่มีเทมเพลตรายงานที่บันทึกไว้ สามารถสร้างได้จากแบบฟอร์มด้านซ้าย
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {templates.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">
                              {tpl.name}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {tpl.description}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                              <span>ระบบ: {tpl.sourceSystemFilter}</span>
                              <span aria-hidden="true">·</span>
                              <span>หมวดหมู่: {tpl.categoryFilter}</span>
                              <span aria-hidden="true">·</span>
                              <span>สถานะ: {tpl.statusFilter}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                จัดกลุ่มตาม: {GROUP_BY_LABELS[tpl.groupByField]}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleApplyTemplate(tpl)}
                              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              เรียกดูรายงาน
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(tpl.id)}
                              className="p-2 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                              title="ลบเทมเพลต"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: CROSS-SYSTEM DATA SYNC & IMPORT */}
            {activeTab === 'sync' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Batch JSON / CSV Importer */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-blue-600" />
                      <h2 className="text-base font-semibold text-slate-900">
                        นำเข้าข้อมูลจากระบบอื่น (JSON / CSV Batch Sync)
                      </h2>
                    </div>
                    <label className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      อัปโหลดไฟล์ .json / .csv
                      <input
                        type="file"
                        accept=".json,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    วางข้อมูล JSON Array ที่ดึงมาจาก Firebase อีกระบบหนึ่ง หรืออัปโหลดไฟล์ CSV/JSON
                    เพื่อซิงค์เข้าสู่ Collection{' '}
                    <code className="font-mono">report_records</code>{' '}
                    พร้อมตรวจสอบโครงสร้างข้อมูลอัตโนมัติ
                  </p>

                  <textarea
                    rows={12}
                    value={jsonInputText}
                    onChange={(e) => setJsonInputText(e.target.value)}
                    className="w-full p-3 text-xs font-mono bg-slate-900 text-slate-100 rounded-lg border border-slate-800 focus:outline-none mb-4"
                  />

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setJsonInputText(SAMPLE_JSON_IMPORT_PAYLOAD)
                      }
                      className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      คืนค่าตัวอย่าง JSON
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchJsonImport}
                      disabled={actionBusy}
                      className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      นำเข้าข้อมูลเข้าสู่ Firestore
                    </button>
                  </div>
                </div>

                {/* Manual Single Record Entry */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Plus className="w-4 h-4 text-slate-700" />
                    <h2 className="text-base font-semibold text-slate-900">
                      เพิ่มรายการรายงานรายเอกสาร
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                    ทดสอบเพิ่มข้อมูลธุรกรรมจากระบบต้นทางต่างๆ เพื่อดูผลลัพธ์การคำนวณแบบ Real-time
                  </p>

                  <form onSubmit={handleCreateRecord} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          ระบบต้นทาง (Source System)
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={
                            BLUEPRINT_CONSTRAINTS.RECORD.SOURCE_SYSTEM_MAX
                          }
                          value={newSourceSystem}
                          onChange={(e) => setNewSourceSystem(e.target.value)}
                          placeholder="เช่น ERP-SAP, POS-Branch"
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          เลขที่เอกสารอ้างอิง (Reference Code)
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={
                            BLUEPRINT_CONSTRAINTS.RECORD.REFERENCE_CODE_MAX
                          }
                          value={newReferenceCode}
                          onChange={(e) => setNewReferenceCode(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        ชื่อรายการ / รายละเอียดธุรกรรม
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={BLUEPRINT_CONSTRAINTS.RECORD.TITLE_MAX}
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="ระบุรายละเอียดรายการ..."
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          หมวดหมู่รายงาน
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={BLUEPRINT_CONSTRAINTS.RECORD.CATEGORY_MAX}
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          แผนก / สาขา
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={
                            BLUEPRINT_CONSTRAINTS.RECORD.DEPARTMENT_MAX
                          }
                          value={newDepartment}
                          onChange={(e) => setNewDepartment(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          มูลค่า (THB)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={BLUEPRINT_CONSTRAINTS.RECORD.AMOUNT_MAX}
                          step="0.01"
                          required
                          value={newAmount}
                          onChange={(e) => setNewAmount(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          จำนวนหน่วย
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={BLUEPRINT_CONSTRAINTS.RECORD.QUANTITY_MAX}
                          required
                          value={newQuantity}
                          onChange={(e) => setNewQuantity(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          สถานะ
                        </label>
                        <select
                          value={newStatus}
                          onChange={(e) =>
                            setNewStatus(e.target.value as RecordStatus)
                          }
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <option value="completed">สำเร็จแล้ว</option>
                          <option value="pending">รอดำเนินการ</option>
                          <option value="cancelled">ยกเลิกรายการ</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          วันที่เอกสาร
                        </label>
                        <input
                          type="date"
                          required
                          value={newRecordDate}
                          onChange={(e) => setNewRecordDate(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      บันทึกรายการเข้าสู่ฐานข้อมูล
                    </button>
                  </form>
                </div>
              </div>
            )}
        </>
      </main>

      {/* FULL-SCREEN POSTER LIGHTBOX MODAL */}
      {lightboxPoster && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-5xl w-full overflow-hidden grid grid-cols-1 lg:grid-cols-12 max-h-[92vh]">
            {/* Left / Main Poster Preview Column */}
            <div className="lg:col-span-7 bg-slate-950 flex flex-col items-center justify-center p-6 relative min-h-[380px] max-h-[85vh] overflow-auto">
              {lightboxPoster.allImages.length > 0 ? (
                <img
                  src={
                    lightboxPoster.allImages[lightboxImageIndex]?.url ||
                    lightboxPoster.primaryImageUrl ||
                    ''
                  }
                  alt={lightboxPoster.title}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              ) : (
                <div className="w-full max-w-md aspect-[3/4] p-8 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between text-white">
                  <div>
                    <div className="text-xs font-mono text-slate-400 pb-3 mb-5 border-b border-slate-800 flex items-center justify-between">
                      <span>{lightboxPoster.category}</span>
                      <span>{lightboxPoster.dateText || lightboxPoster.docId}</span>
                    </div>
                    <h3 className="text-2xl font-bold leading-snug mb-3">
                      {lightboxPoster.title}
                    </h3>
                    {lightboxPoster.subtitle && (
                      <p className="text-sm text-blue-300 font-medium mb-4">
                        {lightboxPoster.subtitle}
                      </p>
                    )}
                    {lightboxPoster.description && (
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {lightboxPoster.description}
                      </p>
                    )}
                  </div>
                  <div className="pt-4 border-t border-slate-800 space-y-1.5">
                    {lightboxPoster.metadataList.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between text-xs text-slate-400"
                      >
                        <span className="font-mono">{item.key}:</span>
                        <span className="text-slate-100 font-medium">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* If multiple images exist in the document, allow switching */}
              {lightboxPoster.allImages.length > 1 && (
                <div className="flex items-center gap-2 mt-4">
                  {lightboxPoster.allImages.map((imgItem, idx) => (
                    <button
                      key={imgItem.field}
                      type="button"
                      onClick={() => setLightboxImageIndex(idx)}
                      className={`px-2.5 py-1 text-xs font-mono rounded cursor-pointer ${
                        lightboxImageIndex === idx
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      ภาพที่ {idx + 1} ({imgItem.field})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right Metadata & Actions Column */}
            <div className="lg:col-span-5 p-6 flex flex-col justify-between overflow-y-auto max-h-[85vh]">
              <div>
                <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-200">
                  <div className="text-xs text-slate-500 font-mono">
                    ID: {lightboxPoster.docId}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLightboxPoster(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    ปิดหน้าต่าง
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                  <span>{lightboxPoster.category}</span>
                  {lightboxPoster.dateText && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{lightboxPoster.dateText}</span>
                    </>
                  )}
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  {lightboxPoster.title}
                </h3>

                {lightboxPoster.subtitle && (
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    {lightboxPoster.subtitle}
                  </p>
                )}

                {lightboxPoster.description && (
                  <p className="text-xs text-slate-600 leading-relaxed mb-5">
                    {lightboxPoster.description}
                  </p>
                )}

                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-xs font-semibold text-slate-900 mb-3">
                    ข้อมูลทุกฟิลด์ที่บันทึกในรายงานโปสเตอร์นี้
                  </h4>
                  <div className="divide-y divide-slate-100 text-xs">
                    {lightboxPoster.metadataList.map((m) => (
                      <div
                        key={m.key}
                        className="py-2 flex items-start justify-between gap-4"
                      >
                        <span className="font-mono text-slate-500 shrink-0">
                          {m.key}
                        </span>
                        <span className="text-slate-900 font-medium text-right break-all">
                          {m.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-6 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                {lightboxPoster.primaryImageUrl && (
                  <button
                    type="button"
                    onClick={() => handleDownloadPosterImage(lightboxPoster)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    ดาวน์โหลดรูปโปสเตอร์
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const raw = lightboxPoster.rawDoc;
                    setLightboxPoster(null);
                    setSelectedRawDoc(raw);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  ดูโครงสร้าง JSON ดิบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raw Document Inspector Modal */}
      {selectedRawDoc && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  ข้อมูลเอกสารจาก Collection "{externalCollection}"
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Document ID: {String(selectedRawDoc.id)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRawDoc(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto max-h-96">
              {JSON.stringify(selectedRawDoc, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Edit Pending Record Modal */}
      {editingRecord && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  แก้ไขรายการรอดำเนินการ
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {editingRecord.sourceSystem} · {editingRecord.referenceCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                ปิดหน้าต่าง
              </button>
            </div>

            <form onSubmit={handleSaveEditRecord} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  รายละเอียดรายการ
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_CONSTRAINTS.RECORD.TITLE_MAX}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    หมวดหมู่
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_CONSTRAINTS.RECORD.CATEGORY_MAX}
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    แผนก / สาขา
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_CONSTRAINTS.RECORD.DEPARTMENT_MAX}
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    มูลค่า (THB)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={BLUEPRINT_CONSTRAINTS.RECORD.AMOUNT_MAX}
                    step="0.01"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    จำนวนหน่วย
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={BLUEPRINT_CONSTRAINTS.RECORD.QUANTITY_MAX}
                    required
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    วันที่เอกสาร
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="no-print border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>
          Cross-System Firebase Report Studio · แกลเลอรีโปสเตอร์ & รายงานจาก{' '}
          {externalDbId} / {externalCollection}
        </span>
        <span>รองรับการแสดงผลโปสเตอร์ · ส่งออก CSV (UTF-8 Excel) · JSON · Print PDF</span>
      </footer>
    </div>
  );
}
