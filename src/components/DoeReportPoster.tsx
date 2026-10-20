import React, { useMemo, useRef, useState } from 'react';
import { toCanvas } from 'html-to-image';
import {
  BookOpen,
  Calendar,
  CalendarX2,
  CheckCircle2,
  CreditCard,
  Download,
  Edit2,
  FileCode,
  Folder,
  Layers,
  Phone,
  Printer,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserX,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  CustomDoeFieldMap,
  DEFAULT_DOE_GROUPS_META,
  DoePosterReportData,
  DoeTargetGroupItem,
  listNumericFieldsInDoc,
} from '../doePosterUtils';

interface DoeReportPosterProps {
  data: DoePosterReportData;
  onInspectJson?: (rawDoc: Record<string, unknown>) => void;
  compact?: boolean;
  customFieldMap?: CustomDoeFieldMap;
  onUpdateCustomFieldMap?: (nextMap: CustomDoeFieldMap) => void;
}

interface ManualNumericOverrides {
  totalAppointments?: number;
  completedCards?: number;
  noShowCount?: number;
  wrongDateCount?: number;
  spoiledCards?: number;
  groups?: Record<number, number>;
}

// Convert an A4 canvas into a valid single-page A4 PDF (210mm x 297mm = 595.28pt x 841.89pt)
function buildA4PdfFromCanvas(a4Canvas: HTMLCanvasElement): Blob {
  const jpegDataUrl = a4Canvas.toDataURL('image/jpeg', 0.96);
  const base64Data = jpegDataUrl.split(',')[1] || '';
  const binaryStr = atob(base64Data);
  const jpegBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    jpegBytes[i] = binaryStr.charCodeAt(i);
  }

  const pageWidthPt = 595.28; // 210mm in points
  const pageHeightPt = 841.89; // 297mm in points
  const imgWidthPx = a4Canvas.width;
  const imgHeightPx = a4Canvas.height;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const startObj = (objNum: number) => {
    offsets[objNum] = currentOffset;
    pushStr(`${objNum} 0 obj\n`);
  };

  const endObj = () => {
    pushStr('\nendobj\n');
  };

  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // 1: Catalog
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  // 2: Pages
  startObj(2);
  pushStr('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  endObj();

  // 3: Page (A4 Portrait: 595.28 x 841.89 pt)
  startObj(3);
  pushStr(
    `<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Contents 5 0 R >>`
  );
  endObj();

  // 4: Image XObject
  startObj(4);
  pushStr(
    `<< /Type /XObject /Subtype /Image /Width ${imgWidthPx} /Height ${imgHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream');
  endObj();

  // 5: Page Content Stream
  const contentStream = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ`;
  const contentBytes = encoder.encode(contentStream);
  startObj(5);
  pushStr(`<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushStr('\nendstream');
  endObj();

  // Cross-reference table
  const xrefOffset = currentOffset;
  pushStr('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    const off = String(offsets[i] || 0).padStart(10, '0');
    pushStr(`${off} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks, { type: 'application/pdf' });
}

function renderGroupIcon(groupId: number) {
  switch (groupId) {
    case 1:
      return <BookOpen className="w-5 h-5 text-white" />;
    case 2:
      return <Edit2 className="w-5 h-5 text-white" />;
    case 3:
      return <BookOpen className="w-5 h-5 text-white" />;
    case 4:
      return <Folder className="w-5 h-5 text-white" />;
    case 5:
      return <Wrench className="w-5 h-5 text-white" />;
    case 6:
      return <Users className="w-5 h-5 text-white" />;
    case 7:
      return <ShieldCheck className="w-5 h-5 text-white" />;
    case 8:
    default:
      return <CreditCard className="w-5 h-5 text-white" />;
  }
}

function getGroupIconBg(theme: DoeTargetGroupItem['theme']): string {
  switch (theme) {
    case 'blue':
      return 'bg-blue-600 shadow-sm shadow-blue-200';
    case 'purple':
      return 'bg-purple-600 shadow-sm shadow-purple-200';
    case 'indigo':
      return 'bg-indigo-600 shadow-sm shadow-indigo-200';
    case 'sky':
      return 'bg-sky-600 shadow-sm shadow-sky-200';
    case 'orange':
      return 'bg-orange-500 shadow-sm shadow-orange-200';
    case 'emerald':
      return 'bg-emerald-600 shadow-sm shadow-emerald-200';
    case 'rose':
      return 'bg-pink-600 shadow-sm shadow-pink-200';
  }
}

function getGroupProgressColor(
  theme: DoeTargetGroupItem['theme'],
  active: boolean
): string {
  if (!active) return 'bg-slate-200';
  switch (theme) {
    case 'blue':
      return 'bg-blue-600';
    case 'purple':
      return 'bg-purple-600';
    case 'indigo':
      return 'bg-indigo-600';
    case 'sky':
      return 'bg-sky-600';
    case 'orange':
      return 'bg-orange-500';
    case 'emerald':
      return 'bg-emerald-600';
    case 'rose':
      return 'bg-pink-600';
  }
}

export const DoeReportPoster: React.FC<DoeReportPosterProps> = ({
  data,
  onInspectJson,
  compact = false,
  customFieldMap,
  onUpdateCustomFieldMap,
}) => {
  const posterRef = useRef<HTMLDivElement>(null);
  const [exportingPng, setExportingPng] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showFieldConfig, setShowFieldConfig] = useState(false);
  const [manualOverrides, setManualOverrides] =
    useState<ManualNumericOverrides>({});

  const availableNumericFields = useMemo(
    () => listNumericFieldsInDoc(data.rawDoc || {}),
    [data.rawDoc]
  );

  // Compute effective poster data combining `data` with any manual numeric overrides
  const effectiveData = useMemo<DoePosterReportData>(() => {
    const hasManual =
      manualOverrides.totalAppointments !== undefined ||
      manualOverrides.completedCards !== undefined ||
      manualOverrides.noShowCount !== undefined ||
      manualOverrides.wrongDateCount !== undefined ||
      manualOverrides.spoiledCards !== undefined ||
      (manualOverrides.groups &&
        Object.keys(manualOverrides.groups).length > 0);

    if (!hasManual) return data;

    const mergedGroupsBase = data.groups.map((g, idx) => {
      const overrideVal = manualOverrides.groups?.[idx + 1];
      return {
        ...g,
        count: overrideVal !== undefined ? overrideVal : g.count,
      };
    });

    const sumGroups = mergedGroupsBase.reduce((acc, g) => acc + g.count, 0);
    const completedCards =
      manualOverrides.completedCards !== undefined
        ? manualOverrides.completedCards
        : manualOverrides.groups && sumGroups > 0
        ? sumGroups
        : data.completedCards;

    const totalAppointments =
      manualOverrides.totalAppointments !== undefined
        ? manualOverrides.totalAppointments
        : data.totalAppointments;

    const noShowCount =
      manualOverrides.noShowCount !== undefined
        ? manualOverrides.noShowCount
        : data.noShowCount;

    const wrongDateCount =
      manualOverrides.wrongDateCount !== undefined
        ? manualOverrides.wrongDateCount
        : data.wrongDateCount;

    const spoiledCards =
      manualOverrides.spoiledCards !== undefined
        ? manualOverrides.spoiledCards
        : data.spoiledCards;

    const totalGroupsSum = sumGroups > 0 ? sumGroups : completedCards;
    const baseQueue = totalAppointments > 0 ? totalAppointments : 1;
    const serviceSuccessRatePercent =
      totalAppointments > 0
        ? Math.min(100, Math.round((completedCards / totalAppointments) * 100))
        : completedCards > 0
        ? 100
        : 0;

    const groups = mergedGroupsBase.map((g) => ({
      ...g,
      percent:
        totalGroupsSum > 0 ? Math.round((g.count / totalGroupsSum) * 100) : 0,
    }));

    return {
      ...data,
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
    };
  }, [data, manualOverrides]);

  // Render posterRef into an exact A4 Portrait Canvas (1654 x 2339 px = 210mm x 297mm at 200 DPI)
  const renderPosterToA4Canvas = async (): Promise<HTMLCanvasElement> => {
    const el = posterRef.current;
    if (!el) throw new Error('Poster element not found');

    const captureWidth = el.offsetWidth || 840;
    const captureHeight = el.offsetHeight || 1188;
    const captureStyle: Partial<CSSStyleDeclaration> = {
      margin: '0px',
      marginLeft: '0px',
      marginRight: '0px',
      marginTop: '0px',
      marginBottom: '0px',
      transform: 'none',
      width: `${captureWidth}px`,
      maxWidth: `${captureWidth}px`,
      minWidth: `${captureWidth}px`,
      boxSizing: 'border-box',
    };

    let rawCanvas: HTMLCanvasElement;
    try {
      rawCanvas = await toCanvas(el, {
        cacheBust: true,
        pixelRatio: 2,
        width: captureWidth,
        height: captureHeight,
        style: captureStyle,
        backgroundColor: '#eef6ff',
      });
    } catch {
      // Fallback with skipFonts if external Google Fonts stylesheet triggers CORS
      rawCanvas = await toCanvas(el, {
        cacheBust: true,
        pixelRatio: 2,
        width: captureWidth,
        height: captureHeight,
        style: captureStyle,
        backgroundColor: '#eef6ff',
        skipFonts: true,
        fontEmbedCSS: '',
      });
    }

    // Standard A4 Portrait dimensions (210mm x 297mm -> 1 : 1.4142857)
    const a4Width = 1654;
    const a4Height = 2339;
    const a4Canvas = document.createElement('canvas');
    a4Canvas.width = a4Width;
    a4Canvas.height = a4Height;

    const ctx = a4Canvas.getContext('2d');
    if (!ctx) return rawCanvas;

    // Fill A4 sheet with matching official gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, a4Height);
    grad.addColorStop(0, '#eef6ff');
    grad.addColorStop(0.35, '#f6fbff');
    grad.addColorStop(1, '#f8fafc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, a4Width, a4Height);

    // Fit captured poster onto the A4 canvas symmetrically with clean A4 margins
    const marginX = 24;
    const marginY = 24;
    const availW = a4Width - marginX * 2;
    const availH = a4Height - marginY * 2;

    const scale = Math.min(
      availW / rawCanvas.width,
      availH / rawCanvas.height
    );
    const drawW = Math.round(rawCanvas.width * scale);
    const drawH = Math.round(rawCanvas.height * scale);
    const offsetX = Math.round((a4Width - drawW) / 2);
    const offsetY = Math.round((a4Height - drawH) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(rawCanvas, offsetX, offsetY, drawW, drawH);

    return a4Canvas;
  };

  const getSafeFilePrefix = () => {
    const safeDate = (effectiveData.reportDateRaw || '2026-10-20')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 20);
    return `DOE_Report_${effectiveData.provincialOffice}_${safeDate}_A4`;
  };

  const handlePrintOrExportA4Pdf = async () => {
    if (!posterRef.current || exportingPdf) return;
    setExportingPdf(true);
    try {
      const a4Canvas = await renderPosterToA4Canvas();
      const pdfBlob = buildA4PdfFromCanvas(a4Canvas);
      const pdfUrl = URL.createObjectURL(pdfBlob);

      const link = document.createElement('a');
      link.download = `${getSafeFilePrefix()}.pdf`;
      link.href = pdfUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000);

      // Also invoke native print dialog for standalone browser windows
      try {
        window.print();
      } catch {
        // Ignore if sandboxed iframe blocks window.print()
      }
    } catch (err) {
      console.error('Failed to generate A4 PDF:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportPng = async () => {
    if (!posterRef.current || exportingPng) return;
    setExportingPng(true);
    try {
      const a4Canvas = await renderPosterToA4Canvas();
      const dataUrl = a4Canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${getSafeFilePrefix()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export DOE Poster A4 PNG:', err);
    } finally {
      setExportingPng(false);
    }
  };

  const handleFieldMapSelect = (
    slotKey: keyof CustomDoeFieldMap,
    firestoreKey: string
  ) => {
    if (!onUpdateCustomFieldMap) return;
    onUpdateCustomFieldMap({
      ...(customFieldMap || {}),
      [slotKey]: firestoreKey || undefined,
    });
  };

  return (
    <div className="space-y-3">
      {/* Action Toolbar Above Poster */}
      {!compact && (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
            <span className="font-semibold text-slate-900">
              {effectiveData.provincialOffice}
            </span>
            <span aria-hidden="true">·</span>
            <span>{effectiveData.reportDateThai}</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 font-medium">
              ออกบัตรสำเร็จ {effectiveData.completedCards.toLocaleString('th-TH')} ใบ (บัตรเสีย {effectiveData.spoiledCards.toLocaleString('th-TH')} ใบ)
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrintOrExportA4Pdf}
              disabled={exportingPdf}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              {exportingPdf ? 'กำลังสร้าง PDF (A4)...' : 'พิมพ์ / PDF (ขนาด A4)'}
            </button>

            <button
              type="button"
              onClick={handleExportPng}
              disabled={exportingPng}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {exportingPng
                ? 'กำลังสร้างรูป A4...'
                : 'ดาวน์โหลดรูปโปสเตอร์ (.PNG A4)'}
            </button>
          </div>
        </div>
      )}

      {/* Interactive 13-Slot Field Mapping & Numeric Override Drawer */}
      {!compact && showFieldConfig && (
        <div className="no-print bg-slate-50 border border-blue-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                ตารางตรวจสอบและจับคู่ข้อมูลตัวเลขทั้ง 13 ช่องของโปสเตอร์ (Field Mapping &amp; Live Value Editor)
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                เลือกฟิลด์จากฐานข้อมูล Firestore หรือพิมพ์แก้ไขตัวเลขได้โดยตรง ระบบจะคำนวณเปอร์เซ็นต์และอัปเดตโปสเตอร์ทันที
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setManualOverrides({});
                if (onUpdateCustomFieldMap) {
                  onUpdateCustomFieldMap({});
                }
              }}
              className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 self-start cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              รีเซ็ตค่าเริ่มต้น
            </button>
          </div>

          {/* 5 Top KPI Slots */}
          <div>
            <div className="text-[11px] font-bold text-slate-700 mb-2">
              ส่วนที่ 1: ตัวเลขเป้าหมายและการให้บริการหลัก (5 ช่อง)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {(
                [
                  {
                    slot: 'totalAppointments' as const,
                    label: 'คิวนัดหมายทั้งหมด',
                    val: effectiveData.totalAppointments,
                    matched: effectiveData.matchedFieldsDebug?.totalAppointments,
                  },
                  {
                    slot: 'completedCards' as const,
                    label: 'ออกบัตรสำเร็จ',
                    val: effectiveData.completedCards,
                    matched: effectiveData.matchedFieldsDebug?.completedCards,
                  },
                  {
                    slot: 'noShowCount' as const,
                    label: 'ไม่มาตามนัด',
                    val: effectiveData.noShowCount,
                    matched: effectiveData.matchedFieldsDebug?.noShowCount,
                  },
                  {
                    slot: 'wrongDateCount' as const,
                    label: 'มาไม่ตรงวันนัด',
                    val: effectiveData.wrongDateCount,
                    matched: effectiveData.matchedFieldsDebug?.wrongDateCount,
                  },
                  {
                    slot: 'spoiledCards' as const,
                    label: 'บัตรเสีย',
                    val: effectiveData.spoiledCards,
                    matched: effectiveData.matchedFieldsDebug?.spoiledCards,
                  },
                ] as const
              ).map((item) => (
                <div
                  key={item.slot}
                  className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-slate-800">
                      {item.label}
                    </span>
                    <span className="text-[10px] font-mono text-blue-600 truncate max-w-[90px]">
                      {item.matched || 'auto'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={item.val}
                    onChange={(e) => {
                      const nextVal = Math.max(0, Number(e.target.value) || 0);
                      setManualOverrides((prev) => ({
                        ...prev,
                        [item.slot]: nextVal,
                      }));
                    }}
                    className="w-full px-2.5 py-1 text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                  {onUpdateCustomFieldMap && availableNumericFields.length > 0 && (
                    <select
                      value={customFieldMap?.[item.slot] || ''}
                      onChange={(e) =>
                        handleFieldMapSelect(item.slot, e.target.value)
                      }
                      className="w-full px-2 py-1 text-[10px] font-mono bg-slate-50 border border-slate-200 rounded text-slate-600"
                    >
                      <option value="">
                        อัตโนมัติ ({item.matched || 'Auto'})
                      </option>
                      {availableNumericFields.map((nf) => (
                        <option key={nf.key} value={nf.key}>
                          {nf.key} ({nf.sampleValue})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 8 Target Group Slots */}
          <div>
            <div className="text-[11px] font-bold text-slate-700 mb-2">
              ส่วนที่ 2: การออกบัตรใบอนุญาตทำงาน จำแนกตาม 8 กลุ่มเป้าหมายและมาตรา (8 ช่อง)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {DEFAULT_DOE_GROUPS_META.map((meta, idx) => {
                const groupItem = effectiveData.groups[idx];
                const slotKey = `group${idx + 1}` as keyof CustomDoeFieldMap;
                const matchedField =
                  groupItem?.matchedField ||
                  effectiveData.matchedFieldsDebug?.[slotKey];

                return (
                  <div
                    key={meta.id}
                    className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-800 truncate">
                        {meta.title}
                      </span>
                      <span className="text-[10px] font-mono text-blue-600 truncate max-w-[85px]">
                        {matchedField || 'auto'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">
                      {meta.subtitle}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={groupItem?.count ?? 0}
                        onChange={(e) => {
                          const nextVal = Math.max(
                            0,
                            Number(e.target.value) || 0
                          );
                          setManualOverrides((prev) => ({
                            ...prev,
                            groups: {
                              ...(prev.groups || {}),
                              [idx + 1]: nextVal,
                            },
                          }));
                        }}
                        className="w-full px-2.5 py-1 text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                      <span className="text-[11px] font-mono font-bold text-blue-700 shrink-0">
                        {groupItem?.percent ?? 0}%
                      </span>
                    </div>
                    {onUpdateCustomFieldMap &&
                      availableNumericFields.length > 0 && (
                        <select
                          value={customFieldMap?.[slotKey] || ''}
                          onChange={(e) =>
                            handleFieldMapSelect(slotKey, e.target.value)
                          }
                          className="w-full px-2 py-1 text-[10px] font-mono bg-slate-50 border border-slate-200 rounded text-slate-600"
                        >
                          <option value="">
                            อัตโนมัติ ({matchedField || 'Auto'})
                          </option>
                          {availableNumericFields.map((nf) => (
                            <option key={nf.key} value={nf.key}>
                              {nf.key} ({nf.sampleValue})
                            </option>
                          ))}
                        </select>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL DOE EXECUTIVE SUMMARY REPORT POSTER CANVAS */}
      <div className="overflow-x-auto flex justify-center">
        <div
          ref={posterRef}
          className="a4-poster-sheet m-0 w-[840px] max-w-[840px] min-w-[840px] shrink-0 rounded-[28px] p-7 sm:p-8 text-slate-900 shadow-sm border border-sky-100"
          style={{
            background:
              'linear-gradient(180deg, #eef6ff 0%, #f6fbff 35%, #f8fafc 100%)',
          }}
        >
          {/* 1. TOP HEADER */}
          <div className="flex items-start justify-between gap-6 mb-6">
            {/* Left Logo & Department Name */}
            <div className="flex items-center gap-4">
              {/* Official DOE Emblem Box */}
              <div className="w-20 h-20 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center p-1.5 shrink-0 relative overflow-hidden">
                <img
                  src="/assets/aistudio/images_bce5873a.png"
                  alt="ตราสัญลักษณ์กรมการจัดหางาน"
                  className="w-full h-full object-contain"
                />
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                  <span className="px-3 py-1 rounded-full bg-[#1e3a8a] text-white text-[11px] font-extrabold tracking-wider uppercase">
                    {effectiveData.departmentEng}
                  </span>
                  <span className="text-sm font-bold text-[#0f4c81]">
                    {effectiveData.departmentThai}
                  </span>
                </div>
                <h1 className="text-2xl font-extrabold text-[#0f2942] tracking-tight leading-snug">
                  {effectiveData.provincialOffice}
                </h1>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  {effectiveData.officeSubtitleEng}
                </p>
              </div>
            </div>

            {/* Right Date Card */}
            <div className="text-right shrink-0">
              <div className="bg-white/90 border border-blue-200/80 rounded-2xl px-4 py-3 flex items-center gap-3.5 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="text-right">
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold mb-1">
                    {effectiveData.reportBadgeText}
                  </div>
                  <div className="text-base font-extrabold text-[#0f2942] whitespace-nowrap">
                    {effectiveData.reportDateThai}
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-semibold text-slate-500 mt-1.5 pr-1">
                {effectiveData.headerRightSubtitle}
              </div>
            </div>
          </div>

          {/* 2. EXECUTIVE SUMMARY BANNER BOX */}
          <div className="bg-white rounded-2xl p-5 mb-5 border-2 border-cyan-400/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-[11px] font-bold text-blue-900">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>{effectiveData.executivePillText}</span>
              </div>
              <h2 className="text-xl font-extrabold text-[#0f172a] leading-snug">
                {effectiveData.reportMainTitle}
              </h2>
            </div>

            <div className="bg-[#f0f7ff] border border-blue-200/80 rounded-xl px-4 py-3 text-right md:max-w-xs shrink-0 flex flex-col justify-center items-end">
              <p className="text-xs font-bold text-[#1e293b] leading-relaxed">
                {effectiveData.serviceCenterName}
              </p>
              <span className="mt-1.5 inline-block px-3 py-0.5 rounded-full bg-white border border-blue-200 text-[11px] font-extrabold text-blue-700">
                {effectiveData.provinceName}
              </span>
            </div>
          </div>

          {/* 3. TOTAL QUEUE TARGET BANNER */}
          <div
            className="rounded-2xl p-5 mb-5 border border-emerald-200/90 flex items-center justify-between gap-4"
            style={{
              background:
                'linear-gradient(90deg, #ecfdf5 0%, #f0fdfa 50%, #ecfdf5 100%)',
            }}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-14 rounded-2xl bg-[#0d9488] text-white flex items-center justify-center shadow-xs shrink-0">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xl font-extrabold text-slate-900">
                    คิวนัดหมายทั้งหมด
                  </span>
                  <span className="px-3 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold">
                    เป้าหมายประจำวัน
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-500 mt-1">
                  จำนวนผู้ลงทะเบียนนัดหมายรับบริการในระบบทั้งหมดประจำวัน
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="text-4xl font-black text-[#064e3b] font-mono tabular-nums tracking-tight">
                  {effectiveData.totalAppointments.toLocaleString('th-TH')}
                </span>
                <span className="text-sm font-bold text-emerald-800">คิว</span>
              </div>
              <div className="text-xs font-semibold text-emerald-700/80 mt-0.5">
                เป้าหมายให้บริการ 100%
              </div>
            </div>
          </div>

          {/* 4. FOUR KPI CARDS */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {/* Card 1: ออกบัตรสำเร็จ */}
            <div className="bg-white rounded-2xl p-4 border-2 border-emerald-400/80 flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm font-extrabold text-slate-800">
                  ออกบัตรสำเร็จ
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="text-3xl font-black text-emerald-700 font-mono tabular-nums">
                  {effectiveData.completedCards.toLocaleString('th-TH')}
                </span>
                <span className="text-xs font-bold text-slate-500">ใบ</span>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  <TrendingUp className="w-3.5 h-3.5" />
                  สำเร็จ {effectiveData.completedPercent}%
                </span>
              </div>
            </div>

            {/* Card 2: ไม่มาตามนัด */}
            <div className="bg-white rounded-2xl p-4 border-2 border-rose-300/90 flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm font-extrabold text-slate-800">
                  ไม่มาตามนัด
                </span>
                <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                  <UserX className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="text-3xl font-black text-rose-600 font-mono tabular-nums">
                  {effectiveData.noShowCount.toLocaleString('th-TH')}
                </span>
                <span className="text-xs font-bold text-slate-500">คน</span>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                  ขาดนัด {effectiveData.noShowPercent}%
                </span>
              </div>
            </div>

            {/* Card 3: มาไม่ตรงวันนัด */}
            <div className="bg-white rounded-2xl p-4 border-2 border-amber-300/90 flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm font-extrabold text-slate-800">
                  มาไม่ตรงวันนัด
                </span>
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <CalendarX2 className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="text-3xl font-black text-amber-700 font-mono tabular-nums">
                  {effectiveData.wrongDateCount.toLocaleString('th-TH')}
                </span>
                <span className="text-xs font-bold text-slate-500">คน</span>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                  ผิดวันนัด {effectiveData.wrongDatePercent}%
                </span>
              </div>
            </div>

            {/* Card 4: บัตรเสีย */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm font-extrabold text-slate-800">
                  บัตรเสีย
                </span>
                <div className="w-9 h-9 rounded-xl bg-slate-700 text-white flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="text-3xl font-black text-slate-800 font-mono tabular-nums">
                  {effectiveData.spoiledCards.toLocaleString('th-TH')}
                </span>
                <span className="text-xs font-bold text-slate-500">คน</span>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-200/80 text-slate-700 text-xs font-bold">
                  บัตรเสีย {effectiveData.spoiledPercent}%
                </span>
              </div>
            </div>
          </div>

          {/* 5. WORK PERMIT 8 TARGET GROUPS SECTION */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs mb-5">
            {/* Section Header */}
            <div className="flex items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    การออกบัตรใบอนุญาตทำงาน
                  </h3>
                  <p className="text-xs font-medium text-slate-500">
                    จำแนกตาม 8 กลุ่มเป้าหมายและมาตรา
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-sm font-extrabold text-blue-900">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>
                  รวม {effectiveData.totalGroupsSum.toLocaleString('th-TH')} คน
                </span>
              </div>
            </div>

            {/* 2x4 Grid of 8 Target Groups */}
            <div className="grid grid-cols-2 gap-3.5 mb-5">
              {effectiveData.groups.map((group) => {
                const isActive = group.count > 0;
                return (
                  <div
                    key={group.id}
                    className={`rounded-2xl p-3.5 transition-all ${
                      isActive
                        ? 'bg-[#f5f9ff] border-2 border-blue-400/90'
                        : 'bg-[#f8fafc] border border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-10 rounded-xl flex items-center justify-center shrink-0 ${getGroupIconBg(
                            group.theme
                          )}`}
                        >
                          {renderGroupIcon(group.id)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold text-slate-900 truncate">
                              {group.title}
                            </span>
                            {group.isHot && (
                              <span className="px-2 py-0.5 rounded-md bg-orange-500 text-white text-[10px] font-extrabold tracking-wide uppercase">
                                ★ HOT
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-[11px] font-medium truncate mt-0.5 ${
                              isActive ? 'text-blue-700' : 'text-slate-500'
                            }`}
                          >
                            {group.subtitle}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-lg font-black text-slate-900 font-mono tabular-nums">
                            {group.count.toLocaleString('th-TH')}
                          </span>
                          <span className="text-xs font-semibold text-slate-500 ml-1">
                            คน
                          </span>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-lg text-[11px] font-extrabold font-mono tabular-nums min-w-[40px] text-center ${
                            isActive
                              ? group.theme === 'sky'
                                ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                : 'bg-blue-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600'
                          }`}
                        >
                          {group.percent}%
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getGroupProgressColor(
                          group.theme,
                          isActive
                        )}`}
                        style={{
                          width: `${
                            isActive ? Math.max(6, group.percent) : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Summary Sub-Banner inside White Box */}
            <div className="rounded-2xl bg-[#f8fafc] border border-slate-200/90 p-4 grid grid-cols-2 gap-4 items-center">
              {/* Left Half */}
              <div className="flex items-center gap-3.5 border-r border-slate-200 pr-4">
                <div className="w-10 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-slate-700">
                      รวมผู้รับบริการที่ออกบัตรทั้งหมด
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-extrabold">
                      8 กลุ่มเป้าหมาย
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                      {effectiveData.completedCards.toLocaleString('th-TH')}
                    </span>
                    <span className="text-xs font-bold text-slate-700">คน</span>
                    <span className="text-xs text-slate-400 font-medium">
                      (ออกใบอนุญาตสำเร็จ)
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Half */}
              <div className="flex items-center justify-between pl-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-slate-700">
                      อัตราความสำเร็จการให้บริการ
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                      เป้าหมายคิวนัดหมาย
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-emerald-700 font-mono tabular-nums">
                      {effectiveData.serviceSuccessRatePercent}%
                    </span>
                    <span className="text-xs text-slate-500 font-mono font-medium">
                      ({effectiveData.completedCards.toLocaleString('th-TH')} /{' '}
                      {effectiveData.totalAppointments.toLocaleString('th-TH')} คิว)
                    </span>
                  </div>
                </div>

                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          {/* 6. FOOTER REPORTER & CONTACT BAR */}
          <div className="bg-white rounded-2xl px-5 py-3.5 border border-slate-200/90 flex items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-800 font-extrabold text-xs flex items-center justify-center shrink-0">
                DOE
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-extrabold text-slate-900">
                    ผู้รายงาน: {effectiveData.reporterName}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-extrabold">
                    {effectiveData.verifiedStatusText}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  ตำแหน่ง: {effectiveData.reporterPosition}
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-sm font-extrabold font-mono shrink-0">
              <Phone className="w-4 h-4" />
              <span>{effectiveData.contactPhone}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
