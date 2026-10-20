/**
 * Utilities for detecting, normalizing, and extracting Poster Images & Metadata
 * from arbitrary Firestore documents (e.g., the external `reports` collection).
 */

export interface ExtractedPosterData {
  docId: string;
  primaryImageUrl: string | null;
  imageFieldKey: string | null;
  allImages: { field: string; url: string }[];
  title: string;
  subtitle: string;
  description: string;
  category: string;
  dateText: string;
  metadataList: { key: string; value: string }[];
  rawDoc: Record<string, unknown>;
}

const IMAGE_KEY_HINTS = [
  'poster',
  'posterurl',
  'posterimage',
  'posterdata',
  'posterbase64',
  'image',
  'imageurl',
  'imagedata',
  'imagebase64',
  'img',
  'imgurl',
  'thumbnail',
  'thumbnailurl',
  'cover',
  'coverurl',
  'banner',
  'bannerurl',
  'artwork',
  'photo',
  'photourl',
  'picture',
  'fileurl',
  'mediaurl',
  'downloadurl',
  'url',
  'src',
  'base64',
];

/**
 * Checks if a raw string is a valid image URL or Base64 image data,
 * and returns a normalized `src` attribute string for `<img>` or null.
 */
export function detectAndNormalizeImageString(
  rawVal: unknown,
  fieldKey = ''
): string | null {
  if (typeof rawVal !== 'string') return null;
  const trimmed = rawVal.trim();
  if (!trimmed || trimmed.length < 10) return null;

  // 1. Standard Data URI for images
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(trimmed)) {
    return trimmed;
  }

  // 2. Raw Base64 signatures (PNG, JPEG, GIF, WEBP) without data: prefix
  const cleanBase64 = trimmed.replace(/\s+/g, '');
  if (cleanBase64.length > 100 && /^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
    if (cleanBase64.startsWith('iVBORw0KGgo')) {
      return `data:image/png;base64,${cleanBase64}`;
    }
    if (cleanBase64.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${cleanBase64}`;
    }
    if (cleanBase64.startsWith('R0lGOD')) {
      return `data:image/gif;base64,${cleanBase64}`;
    }
    if (cleanBase64.startsWith('UklGR')) {
      return `data:image/webp;base64,${cleanBase64}`;
    }
    const lowerKey = fieldKey.toLowerCase();
    if (
      IMAGE_KEY_HINTS.some((hint) => lowerKey.includes(hint)) &&
      cleanBase64.length > 250
    ) {
      return `data:image/png;base64,${cleanBase64}`;
    }
  }

  // 3. HTTP / HTTPS URLs
  if (/^https?:\/\//i.test(trimmed)) {
    const lowerUrl = trimmed.toLowerCase();
    const lowerKey = fieldKey.toLowerCase();

    const hasImageExtension =
      /\.(png|jpe?g|webp|gif|svg|bmp|avif)(\?|#|$)/i.test(lowerUrl);
    const isCloudStorageImage =
      lowerUrl.includes('firebasestorage.googleapis.com') ||
      lowerUrl.includes('storage.googleapis.com') ||
      lowerUrl.includes('googleusercontent.com') ||
      lowerUrl.includes('cloudinary.com') ||
      lowerUrl.includes('imgur.com') ||
      lowerUrl.includes('supabase.co/storage');
    const isImageFieldKey = IMAGE_KEY_HINTS.some((hint) =>
      lowerKey.includes(hint)
    );

    if (hasImageExtension || isCloudStorageImage || isImageFieldKey) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Recursively scans a document object for all image URLs / Base64 strings.
 */
export function findAllImagesInDocument(
  obj: Record<string, unknown>,
  prefix = ''
): { field: string; url: string }[] {
  const found: { field: string; url: string }[] = [];

  Object.entries(obj).forEach(([key, val]) => {
    if (key === 'id') return;
    const pathKey = prefix ? `${prefix}.${key}` : key;

    const directImg = detectAndNormalizeImageString(val, key);
    if (directImg) {
      found.push({ field: pathKey, url: directImg });
      return;
    }

    if (Array.isArray(val)) {
      val.forEach((item, idx) => {
        const arrImg = detectAndNormalizeImageString(item, key);
        if (arrImg) {
          found.push({ field: `${pathKey}[${idx}]`, url: arrImg });
        } else if (item && typeof item === 'object') {
          found.push(
            ...findAllImagesInDocument(
              item as Record<string, unknown>,
              `${pathKey}[${idx}]`
            )
          );
        }
      });
      return;
    }

    if (val && typeof val === 'object') {
      found.push(
        ...findAllImagesInDocument(val as Record<string, unknown>, pathKey)
      );
    }
  });

  // Sort so fields explicitly named 'poster*' or 'image*' come first
  found.sort((a, b) => {
    const aLower = a.field.toLowerCase();
    const bLower = b.field.toLowerCase();
    const aScore = aLower.includes('poster')
      ? 0
      : aLower.includes('image') || aLower.includes('cover')
      ? 1
      : 2;
    const bScore = bLower.includes('poster')
      ? 0
      : bLower.includes('image') || bLower.includes('cover')
      ? 1
      : 2;
    return aScore - bScore;
  });

  return found;
}

function pickFirstString(
  docObj: Record<string, unknown>,
  candidateKeys: string[],
  fallback = ''
): string {
  for (const key of candidateKeys) {
    const exact = docObj[key];
    if (
      typeof exact === 'string' &&
      exact.trim() &&
      !detectAndNormalizeImageString(exact, key)
    ) {
      return exact.trim();
    }
    // Case-insensitive match
    const foundEntry = Object.entries(docObj).find(
      ([k]) => k.toLowerCase() === key.toLowerCase()
    );
    if (
      foundEntry &&
      typeof foundEntry[1] === 'string' &&
      foundEntry[1].trim() &&
      !detectAndNormalizeImageString(foundEntry[1], foundEntry[0])
    ) {
      return foundEntry[1].trim();
    }
  }
  return fallback;
}

/**
 * Extracts structured poster presentation data from any Firestore document.
 */
export function extractPosterFromDoc(
  docObj: Record<string, unknown>,
  preferredImageField = 'AUTO'
): ExtractedPosterData {
  const docId = String(docObj.id || 'doc');
  const allImages = findAllImagesInDocument(docObj);

  let primaryImageUrl: string | null = null;
  let imageFieldKey: string | null = null;

  if (preferredImageField !== 'AUTO' && preferredImageField) {
    const customVal = docObj[preferredImageField];
    const normalizedCustom = detectAndNormalizeImageString(
      customVal,
      preferredImageField
    );
    if (normalizedCustom) {
      primaryImageUrl = normalizedCustom;
      imageFieldKey = preferredImageField;
    } else {
      const matched = allImages.find((img) => img.field === preferredImageField);
      if (matched) {
        primaryImageUrl = matched.url;
        imageFieldKey = matched.field;
      }
    }
  }

  if (!primaryImageUrl && allImages.length > 0) {
    primaryImageUrl = allImages[0].url;
    imageFieldKey = allImages[0].field;
  }

  const title = pickFirstString(
    docObj,
    [
      'title',
      'posterTitle',
      'reportTitle',
      'name',
      'headline',
      'subject',
      'topic',
      'campaignName',
      'eventName',
      'projectName',
    ],
    `รายงานโปสเตอร์ #${docId.slice(0, 8)}`
  );

  const subtitle = pickFirstString(
    docObj,
    [
      'subtitle',
      'subTitle',
      'tagline',
      'department',
      'organization',
      'agency',
      'location',
      'province',
      'branch',
      'author',
      'createdBy',
    ],
    ''
  );

  const description = pickFirstString(
    docObj,
    [
      'description',
      'summary',
      'content',
      'details',
      'body',
      'caption',
      'note',
      'notes',
      'message',
      'objective',
    ],
    ''
  );

  const category = pickFirstString(
    docObj,
    ['category', 'type', 'reportType', 'posterType', 'theme', 'status', 'tag'],
    'รายงานโปสเตอร์'
  );

  const rawDate = pickFirstString(
    docObj,
    ['recordDate', 'reportDate', 'date', 'createdAt', 'updatedAt', 'timestamp'],
    ''
  );
  const dateText = rawDate ? rawDate.slice(0, 10) : '';

  const metadataList: { key: string; value: string }[] = [];
  Object.entries(docObj).forEach(([k, v]) => {
    if (k === 'id') return;
    if (detectAndNormalizeImageString(v, k)) return;
    if (typeof v === 'string' && v.length > 220) return;
    if (v === null || v === undefined || v === '') return;

    const strVal =
      typeof v === 'object' ? JSON.stringify(v) : String(v).trim();
    if (strVal && strVal.length <= 160) {
      metadataList.push({ key: k, value: strVal });
    }
  });

  return {
    docId,
    primaryImageUrl,
    imageFieldKey,
    allImages,
    title,
    subtitle,
    description,
    category,
    dateText,
    metadataList: metadataList.slice(0, 8),
    rawDoc: docObj,
  };
}
