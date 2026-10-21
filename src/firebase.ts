import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  collection,
  doc,
  Firestore,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const DEFAULT_EXTERNAL_ENDPOINT =
  'https://firestore.googleapis.com/v1/projects/promising-imagery-l09p9/databases/ai-studio-doe-984116b9-6043-43c8-97a4-66738b218bdc/documents/reports';

export const connectedProjectInfo = {
  projectId: firebaseConfig.projectId,
  databaseId: firebaseConfig.firestoreDatabaseId,
  externalDatabaseId: 'ai-studio-doe-984116b9-6043-43c8-97a4-66738b218bdc',
  externalCollection: 'reports',
};

const externalDbCache = new Map<string, Firestore>();

export function getExternalFirestore(databaseId: string): Firestore {
  const cleanId = databaseId.trim();
  if (!cleanId || cleanId === firebaseConfig.firestoreDatabaseId) {
    return db;
  }
  const existing = externalDbCache.get(cleanId);
  if (existing) return existing;
  const instance = getFirestore(app, cleanId);
  externalDbCache.set(cleanId, instance);
  return instance;
}

export interface ParsedFirestoreUrl {
  projectId: string;
  databaseId: string;
  collectionPath: string;
  restUrl: string;
}

export function parseFirestoreEndpoint(
  rawUrlOrPath: string,
  fallbackDbId = 'ai-studio-doe-984116b9-6043-43c8-97a4-66738b218bdc',
  fallbackCollection = 'reports'
): ParsedFirestoreUrl {
  const trimmed = rawUrlOrPath.trim();
  const regex =
    /projects\/([^/]+)\/databases\/([^/]+)\/documents\/([^\s?#]+)/i;
  const match = trimmed.match(regex);

  if (match) {
    const projectId = match[1];
    const databaseId = match[2];
    const collectionPath = match[3].replace(/^\/+|\/+$/g, '');
    return {
      projectId,
      databaseId,
      collectionPath,
      restUrl: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionPath}`,
    };
  }

  const projectId = firebaseConfig.projectId;
  const databaseId = fallbackDbId.trim() || firebaseConfig.firestoreDatabaseId;
  const collectionPath =
    (trimmed && !trimmed.startsWith('http') ? trimmed : fallbackCollection)
      .replace(/^\/+|\/+$/g, '') || 'reports';

  return {
    projectId,
    databaseId,
    collectionPath,
    restUrl: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionPath}`,
  };
}

function unwrapFirestoreRestValue(valObj: Record<string, unknown>): unknown {
  if (!valObj || typeof valObj !== 'object') return valObj;
  if ('stringValue' in valObj) return valObj.stringValue;
  if ('integerValue' in valObj) return Number(valObj.integerValue);
  if ('doubleValue' in valObj) return Number(valObj.doubleValue);
  if ('booleanValue' in valObj) return Boolean(valObj.booleanValue);
  if ('nullValue' in valObj) return null;
  if ('timestampValue' in valObj) return String(valObj.timestampValue);
  if ('arrayValue' in valObj) {
    const arrVal = valObj.arrayValue as { values?: Record<string, unknown>[] };
    return (arrVal?.values || []).map((v) => unwrapFirestoreRestValue(v));
  }
  if ('mapValue' in valObj) {
    const mapVal = valObj.mapValue as {
      fields?: Record<string, Record<string, unknown>>;
    };
    const out: Record<string, unknown> = {};
    if (mapVal?.fields) {
      Object.entries(mapVal.fields).forEach(([k, v]) => {
        out[k] = unwrapFirestoreRestValue(v);
      });
    }
    return out;
  }
  return valObj;
}

function normalizeSdkDocData(
  id: string,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { id };
  Object.entries(raw).forEach(([key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      'toDate' in value &&
      typeof (value as { toDate: () => Date }).toDate === 'function'
    ) {
      normalized[key] = (value as { toDate: () => Date })
        .toDate()
        .toISOString();
    } else if (
      value &&
      typeof value === 'object' &&
      'seconds' in value &&
      typeof (value as { seconds: number }).seconds === 'number'
    ) {
      normalized[key] = new Date(
        (value as { seconds: number }).seconds * 1000
      ).toISOString();
    } else {
      normalized[key] = value;
    }
  });
  return normalized;
}

export interface ExternalFetchResult {
  documents: Record<string, unknown>[];
  strategyUsed: string;
  parsedEndpoint: ParsedFirestoreUrl;
  errorMessage?: string;
  triedStrategies: string[];
}

export function subscribeExternalFirestoreReports(
  endpointUrl: string,
  customDbId: string | undefined,
  customCollection: string | undefined,
  onUpdate: (result: ExternalFetchResult) => void,
  onFallbackNeeded?: () => void
): () => void {
  const parsed = parseFirestoreEndpoint(
    endpointUrl,
    customDbId,
    customCollection
  );
  if (customDbId && customDbId.trim()) {
    parsed.databaseId = customDbId.trim();
  }
  if (customCollection && customCollection.trim()) {
    parsed.collectionPath = customCollection.trim().replace(/^\/+|\/+$/g, '');
  }
  parsed.restUrl = `https://firestore.googleapis.com/v1/projects/${parsed.projectId}/databases/${parsed.databaseId}/documents/${parsed.collectionPath}`;

  const targetDb = getExternalFirestore(parsed.databaseId);
  const q = query(collection(targetDb, parsed.collectionPath), limit(250));

  const unsub = onSnapshot(
    q,
    (snap) => {
      onUpdate({
        documents: snap.docs.map((d) => normalizeSdkDocData(d.id, d.data())),
        strategyUsed:
          'อัปเดตอัตโนมัติแบบ Real-time ผ่าน Firebase SDK (onSnapshot)',
        parsedEndpoint: parsed,
        triedStrategies: [
          `SDK Real-time Listener: db(${parsed.databaseId}) -> collection("${parsed.collectionPath}")`,
        ],
      });
    },
    () => {
      if (onFallbackNeeded) onFallbackNeeded();
    }
  );

  return unsub;
}

export function subscribeExternalPosterMeta(
  endpointUrl: string,
  customDbId: string | undefined,
  onCategoriesUpdate: (
    categories: {
      id: string;
      title: string;
      subLabel: string;
      sortOrder: number;
      color?: string;
      icon?: string;
    }[]
  ) => void,
  onQueueMetricsUpdate?: (
    metrics: {
      id: string;
      title: string;
      subLabel: string;
      unit: string;
      sortOrder: number;
    }[]
  ) => void
): () => void {
  const parsed = parseFirestoreEndpoint(endpointUrl, customDbId, 'reports');
  if (customDbId && customDbId.trim()) {
    parsed.databaseId = customDbId.trim();
  }
  const targetDb = getExternalFirestore(parsed.databaseId);

  const unsubCategories = onSnapshot(
    collection(targetDb, 'categories'),
    (snap) => {
      if (snap.empty) return;
      const cats = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            title: String(data.title || ''),
            subLabel: String(data.subLabel || ''),
            sortOrder:
              typeof data.sortOrder === 'number' ? data.sortOrder : 99,
            color: typeof data.color === 'string' ? data.color : undefined,
            icon: typeof data.icon === 'string' ? data.icon : undefined,
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);
      onCategoriesUpdate(cats);
    },
    () => {
      // Fallback to static defaults if categories collection is not readable
    }
  );

  let unsubMetrics: (() => void) | null = null;
  if (onQueueMetricsUpdate) {
    unsubMetrics = onSnapshot(
      collection(targetDb, 'queue_metrics'),
      (snap) => {
        if (snap.empty) return;
        const metrics = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              title: String(data.title || ''),
              subLabel: String(data.subLabel || ''),
              unit: String(data.unit || ''),
              sortOrder:
                typeof data.sortOrder === 'number' ? data.sortOrder : 99,
            };
          })
          .sort((a, b) => a.sortOrder - b.sortOrder);
        onQueueMetricsUpdate(metrics);
      },
      () => {
        // Fallback to static defaults if queue_metrics is not readable
      }
    );
  }

  return () => {
    unsubCategories();
    if (unsubMetrics) unsubMetrics();
  };
}

export async function fetchExternalFirestoreReports(
  endpointUrl: string,
  customDbId?: string,
  customCollection?: string,
  customOwnerField?: string
): Promise<ExternalFetchResult> {
  const parsed = parseFirestoreEndpoint(
    endpointUrl,
    customDbId,
    customCollection
  );
  if (customDbId && customDbId.trim()) {
    parsed.databaseId = customDbId.trim();
  }
  if (customCollection && customCollection.trim()) {
    parsed.collectionPath = customCollection.trim().replace(/^\/+|\/+$/g, '');
  }
  parsed.restUrl = `https://firestore.googleapis.com/v1/projects/${parsed.projectId}/databases/${parsed.databaseId}/documents/${parsed.collectionPath}`;

  const currentUser = auth.currentUser;
  const triedStrategies: string[] = [];
  let lastError = '';

  const targetDb = getExternalFirestore(parsed.databaseId);

  // Strategy 1: Direct Firestore SDK Collection Query
  try {
    triedStrategies.push(
      `SDK Direct Query: db(${parsed.databaseId}) -> collection("${parsed.collectionPath}")`
    );
    const q = query(collection(targetDb, parsed.collectionPath), limit(250));
    const snap = await getDocs(q);
    return {
      documents: snap.docs.map((d) => normalizeSdkDocData(d.id, d.data())),
      strategyUsed: 'เชื่อมต่อผ่าน Firebase SDK โดยตรง (Direct Collection Query)',
      parsedEndpoint: parsed,
      triedStrategies,
    };
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  // Strategy 2: Authenticated Firestore REST API v1 with Bearer ID Token
  if (currentUser) {
    try {
      triedStrategies.push(`REST API v1 + Bearer Token: ${parsed.restUrl}`);
      const idToken = await currentUser.getIdToken();
      const response = await fetch(`${parsed.restUrl}?pageSize=200`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const json = await response.json();
        if (json.documents && Array.isArray(json.documents)) {
          const docs = json.documents.map(
            (docItem: {
              name?: string;
              fields?: Record<string, Record<string, unknown>>;
              createTime?: string;
              updateTime?: string;
            }) => {
              const nameParts = (docItem.name || '').split('/');
              const docId = nameParts[nameParts.length - 1] || 'doc';
              const obj: Record<string, unknown> = { id: docId };
              if (docItem.fields) {
                Object.entries(docItem.fields).forEach(([k, v]) => {
                  obj[k] = unwrapFirestoreRestValue(v);
                });
              }
              if (!obj.createdAt && docItem.createTime) {
                obj.createdAt = docItem.createTime;
              }
              return obj;
            }
          );
          return {
            documents: docs,
            strategyUsed: 'ดึงผ่าน Firestore REST API v1 พร้อมแนบ Google ID Token',
            parsedEndpoint: parsed,
            triedStrategies,
          };
        } else if (json.fields) {
          // Single document endpoint
          const nameParts = (json.name || '').split('/');
          const docId = nameParts[nameParts.length - 1] || 'doc';
          const obj: Record<string, unknown> = { id: docId };
          Object.entries(
            json.fields as Record<string, Record<string, unknown>>
          ).forEach(([k, v]) => {
            obj[k] = unwrapFirestoreRestValue(v);
          });
          return {
            documents: [obj],
            strategyUsed: 'ดึงเอกสารเดี่ยวผ่าน Firestore REST API v1',
            parsedEndpoint: parsed,
            triedStrategies,
          };
        } else {
          // Empty collection on REST API
          return {
            documents: [],
            strategyUsed: 'เชื่อมต่อผ่าน Firestore REST API v1 สำเร็จ (ยังไม่มีเอกสารใน Collection)',
            parsedEndpoint: parsed,
            triedStrategies,
          };
        }
      } else {
        const errBody = await response.json().catch(() => null);
        if (errBody?.error?.message) {
          lastError = errBody.error.message;
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Strategy 3: Owner-Scoped SDK Queries (when Security Rules require resource.data.<ownerField> == request.auth.uid)
    const candidateUidFields = Array.from(
      new Set(
        [
          customOwnerField?.trim(),
          'ownerId',
          'userId',
          'uid',
          'authorId',
          'createdBy',
          'reporterId',
          'staffId',
        ].filter(Boolean) as string[]
      )
    );

    for (const fieldName of candidateUidFields) {
      try {
        triedStrategies.push(
          `SDK Scoped Query: where("${fieldName}", "==", "${currentUser.uid}")`
        );
        const scopedQuery = query(
          collection(targetDb, parsed.collectionPath),
          where(fieldName, '==', currentUser.uid),
          limit(250)
        );
        const snap = await getDocs(scopedQuery);
        return {
          documents: snap.docs.map((d) => normalizeSdkDocData(d.id, d.data())),
          strategyUsed: `เชื่อมต่อผ่าน Firebase SDK โดยกรองสิทธิ์เจ้าของ (${fieldName} == currentUser.uid)`,
          parsedEndpoint: parsed,
          triedStrategies,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // Also try email-scoped queries if user has email
    if (currentUser.email) {
      const candidateEmailFields = ['email', 'userEmail', 'ownerEmail', 'createdByEmail'];
      for (const emailField of candidateEmailFields) {
        try {
          triedStrategies.push(
            `SDK Scoped Query: where("${emailField}", "==", "${currentUser.email}")`
          );
          const emailQuery = query(
            collection(targetDb, parsed.collectionPath),
            where(emailField, '==', currentUser.email),
            limit(250)
          );
          const snap = await getDocs(emailQuery);
          return {
            documents: snap.docs.map((d) => normalizeSdkDocData(d.id, d.data())),
            strategyUsed: `เชื่อมต่อผ่าน Firebase SDK โดยกรองอีเมล (${emailField} == currentUser.email)`,
            parsedEndpoint: parsed,
            triedStrategies,
          };
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }
    }
  }

  return {
    documents: [],
    strategyUsed: 'ไม่สามารถเข้าถึงข้อมูลได้ (ติดสิทธิ์ Firestore Security Rules ของฐานข้อมูลต้นทาง)',
    parsedEndpoint: parsed,
    errorMessage:
      lastError || 'Missing or insufficient permissions on target database.',
    triedStrategies,
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    // Transient network or offline states are handled automatically by the Firestore SDK
    void error;
  }
}

testConnection();

