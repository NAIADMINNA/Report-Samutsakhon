import { RecordStatus } from './types';

export interface SeedRecordInput {
  sourceSystem: string;
  referenceCode: string;
  title: string;
  category: string;
  department: string;
  amount: number;
  quantity: number;
  status: RecordStatus;
  recordDate: string;
}

export const MULTI_SYSTEM_SAMPLE_RECORDS: SeedRecordInput[] = [
  {
    sourceSystem: 'ERP-SAP',
    referenceCode: 'SAP-INV-20261001',
    title: 'ยอดขายส่งอุปกรณ์เครือข่ายองค์กร ล็อต Q4',
    category: 'รายได้จากการขาย',
    department: 'ฝ่ายขายองค์กร (B2B)',
    amount: 485000,
    quantity: 25,
    status: 'completed',
    recordDate: '2026-10-12',
  },
  {
    sourceSystem: 'POS-Branch',
    referenceCode: 'POS-BKK-88412',
    title: 'ยอดขายหน้าร้านสาขาสยามพารากอน ประจำวัน',
    category: 'รายได้จากการขาย',
    department: 'สาขากรุงเทพฯ',
    amount: 142500,
    quantity: 68,
    status: 'completed',
    recordDate: '2026-10-14',
  },
  {
    sourceSystem: 'Shopee-OMS',
    referenceCode: 'SHP-TH-992014',
    title: 'คำสั่งซื้อแคมเปญ 10.10 Official Store',
    category: 'รายได้ออนไลน์',
    department: 'ฝ่ายอีคอมเมิร์ซ',
    amount: 318900,
    quantity: 215,
    status: 'completed',
    recordDate: '2026-10-15',
  },
  {
    sourceSystem: 'CRM-Sales',
    referenceCode: 'CRM-DEAL-409',
    title: 'สัญญาบริการดูแลระบบรายปี (MA Enterprise)',
    category: 'รายได้ค่าบริการ',
    department: 'ฝ่ายบริการลูกค้า',
    amount: 260000,
    quantity: 1,
    status: 'pending',
    recordDate: '2026-10-16',
  },
  {
    sourceSystem: 'ERP-SAP',
    referenceCode: 'SAP-PO-2026045',
    title: 'ต้นทุนนำเข้าชิ้นส่วนอิเล็กทรอนิกส์และเซิร์ฟเวอร์',
    category: 'ต้นทุนสินค้า',
    department: 'คลังสินค้าและจัดซื้อ',
    amount: 195000,
    quantity: 40,
    status: 'completed',
    recordDate: '2026-10-17',
  },
  {
    sourceSystem: 'POS-Branch',
    referenceCode: 'POS-CNX-31049',
    title: 'ยอดขายหน้าร้านสาขาเชียงใหม่ เซ็นทรัลเฟสติวัล',
    category: 'รายได้จากการขาย',
    department: 'สาขาภาคเหนือ',
    amount: 94800,
    quantity: 42,
    status: 'completed',
    recordDate: '2026-10-18',
  },
  {
    sourceSystem: 'Shopee-OMS',
    referenceCode: 'SHP-TH-992580',
    title: 'คำสั่งซื้อรอดำเนินการจัดส่งคลังบางนา',
    category: 'รายได้ออนไลน์',
    department: 'ฝ่ายอีคอมเมิร์ซ',
    amount: 76400,
    quantity: 54,
    status: 'pending',
    recordDate: '2026-10-19',
  },
  {
    sourceSystem: 'CRM-Sales',
    referenceCode: 'CRM-DEAL-412',
    title: 'ใบเสนอราคาโครงการติดตั้งระบบ Cloud ยกเลิกโดยลูกค้า',
    category: 'รายได้ค่าบริการ',
    department: 'ฝ่ายขายองค์กร (B2B)',
    amount: 120000,
    quantity: 1,
    status: 'cancelled',
    recordDate: '2026-10-19',
  },
];

export const SAMPLE_JSON_IMPORT_PAYLOAD = JSON.stringify(
  [
    {
      sourceSystem: 'WMS-Warehouse',
      referenceCode: 'WMS-OUT-7701',
      title: 'เบิกจ่ายสินค้าส่งตัวแทนจำหน่ายภาคตะวันออก',
      category: 'โลจิสติกส์',
      department: 'คลังสินค้าและจัดซื้อ',
      amount: 158000,
      quantity: 85,
      status: 'completed',
      recordDate: '2026-10-19',
    },
    {
      sourceSystem: 'ERP-SAP',
      referenceCode: 'SAP-INV-20261088',
      title: 'วางบิลลูกค้ารายใหญ่ กลุ่มโรงงานอุตสาหกรรม',
      category: 'รายได้จากการขาย',
      department: 'ฝ่ายขายองค์กร (B2B)',
      amount: 340000,
      quantity: 12,
      status: 'pending',
      recordDate: '2026-10-19',
    },
  ],
  null,
  2
);
