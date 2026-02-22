import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';

// Import the logo directly
import logo from './seal.png';

// ============ FIX: SIMPLIFIED FONT REGISTRATION ============
// Remove external font loading which requires internet
Font.register({
  family: 'Helvetica',
});

// ============ FIX: ALTERNATIVE - Use built-in fonts ============
// OR use standard fonts that don't require internet
// Font.registerHyphenationCallback(word => [word]);

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 8,
    fontFamily: 'Helvetica', // Use standard font
    lineHeight: 1.3,
  },
  logo: {
    width: 120,
    height: 50,
    marginBottom: 10,
  },
  header: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  companyHeader: {
    textAlign: 'center',
    marginBottom: 3,
  },
  mtdNumber: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 10,
  },
  boxBorder: {
    border: '1pt solid black',
    padding: 5,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  smallText: {
    fontSize: 7,
    lineHeight: 1.2,
  },
  row: {
    flexDirection: 'row',
    gap: 5,
  },
  col50: {
    width: '50%',
  },
  col25: {
    width: '25%',
  },
  col33: {
    width: '33%',
  },
  transportSection: {
    border: '1pt solid black',
    marginBottom: 2,
  },
  transportRow: {
    flexDirection: 'row',
    borderBottom: '1pt solid black',
  },
  transportCell: {
    padding: 3,
    borderRight: '1pt solid black',
    fontSize: 7,
  },
  transportCellLast: {
    padding: 3,
    fontSize: 7,
  },
  goodsSection: {
    border: '1pt solid black',
    padding: 5,
    marginBottom: 2,
    minHeight: 200,
  },
  bottomSection: {
    border: '1pt solid black',
    padding: 5,
    marginBottom: 2,
  },
  signatureSection: {
    marginTop: 10,
    textAlign: 'right',
    fontSize: 7,
  },
  twoColumnLayout: {
    flexDirection: 'row',
    gap: 5,
  },
  leftColumn: {
    width: '60%',
  },
  rightColumn: {
    width: '40%',
  },
});

// ============ FIX: Safe data access function ============
const getSafeValue = (data, key, defaultValue = '') => {
  if (!data || typeof data !== 'object') return defaultValue;
  
  // Handle nested keys with dot notation
  if (key.includes('.')) {
    const keys = key.split('.');
    let value = data;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    return value || defaultValue;
  }
  
  return data[key] || defaultValue;
};

// ============ FIX: Add error boundary for PDF generation ============
const PDFGenerator = ({ shipmentData = {} }) => {
  // ============ FIX: Validate data before rendering ============
  if (!shipmentData || Object.keys(shipmentData).length === 0) {
    // Return a minimal valid document to prevent crashes
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text>Loading PDF data...</Text>
        </Page>
      </Document>
    );
  }

  // ============ FIX: Safe data access with better defaults ============
  const safeData = {
    // Basic info
    mtdNumber: getSafeValue(shipmentData, 'shipmentNo', getSafeValue(shipmentData, 'mtdNumber', 'MTD-000001')),
    shipment_no: getSafeValue(shipmentData, 'job_no', getSafeValue(shipmentData, 'jobNo', '')),
    
    // Shipper section
    shipper: getSafeValue(shipmentData, 'shipper', 'Not Provided'),
    address: getSafeValue(shipmentData, 'address', 'Not Provided'),
    shipper_tel: getSafeValue(shipmentData, 'shipper_tel', 'N/A'),
    shipper_fax: getSafeValue(shipmentData, 'shipper_fax', 'N/A'),
    
    // Consignee section
    consignee: getSafeValue(shipmentData, 'consignee', 'Not Provided'),
    consignee_address: getSafeValue(shipmentData, 'consignee_address', 'Not Provided'),
    consignee_contact: getSafeValue(shipmentData, 'consignee_contact', 'N/A'),
    consignee_tel: getSafeValue(shipmentData, 'consignee_tel', 'N/A'),
    
    // Notify party
    notify_party: getSafeValue(shipmentData, 'notify_party', 'Same as Consignee'),
    notify_party_address: getSafeValue(shipmentData, 'notify_party_address', 'Same as Consignee'),
    notify_party_contact: getSafeValue(shipmentData, 'notify_party_contact', 'N/A'),
    notify_party_tel: getSafeValue(shipmentData, 'notify_party_tel', 'N/A'),
    
    // Transport details
    placeOfAcceptance: getSafeValue(shipmentData, 'por', 'Not Specified'),
    pol: getSafeValue(shipmentData, 'pol', 'Not Specified'),
    transhipment: getSafeValue(shipmentData, 'transhipment', 'None'),
    mode_of_transport: getSafeValue(shipmentData, 'service_type', 'Not Specified'),
    vessel: getSafeValue(shipmentData, 'vessel_name_summary', getSafeValue(shipmentData, 'vessel', 'Not Specified')),
    pod: getSafeValue(shipmentData, 'pod', 'Not Specified'),
    pof: getSafeValue(shipmentData, 'pof', 'Not Specified'),
    
    // Goods description
    containerNo: getSafeValue(shipmentData, 'containerNo', 'WHSU2286815'),
    sealNo: getSafeValue(shipmentData, 'sealNo', '20SD86 WHA1382852'),
    marks: getSafeValue(shipmentData, 'marks', 'BOX NO.1,2,3,4,5,6, 7,8,9,10,'),
    packages: getSafeValue(shipmentData, 'no_of_res', getSafeValue(shipmentData, 'noOfRes', '15 (FIFTEEN BOXES ONLY)')),
    description: getSafeValue(shipmentData, 'description', 'CI CASTING (SIDE COVER R, SIDE COVER C, BALANCE WEIGHT,'),
    invoiceNo: getSafeValue(shipmentData, 'invoiceNo', '12/FS/EXP/2025-2026'),
    invoiceDate: getSafeValue(shipmentData, 'invoiceDate', '13/08/2025'),
    sbNo: getSafeValue(shipmentData, 'sbNo', '446801'),
    sbDate: getSafeValue(shipmentData, 'sbDate', '14/08/2025'),
    hsCode: getSafeValue(shipmentData, 'hs_code', getSafeValue(shipmentData, 'HSCode', '73251000')),
    grossWeight: getSafeValue(shipmentData, 'gross_weight', getSafeValue(shipmentData, 'grossWeight', '8774.000 KGS')),
    netWeight: getSafeValue(shipmentData, 'net_weight', getSafeValue(shipmentData, 'netWeight', '8290.000 KGS')),
    measurement: getSafeValue(shipmentData, 'volume', '10.000 CBM'),
    
    // Bottom section
    place_of_issue: getSafeValue(shipmentData, 'branch', 'New Delhi'),
    date_of_issue: getSafeValue(shipmentData, 'shipment_date', new Date().toLocaleDateString('en-GB')),
    freight_amount: getSafeValue(shipmentData, 'freight', 'To Be Confirmed'),
    payable_at: getSafeValue(shipmentData, 'payable_at', 'Destination'),
    number_of_originals: 'THREE (03)',
    
    // Delivery agent
    delivery_agent: getSafeValue(shipmentData, 'carrier', 'To Be Assigned'),
    delivery_agent_address: getSafeValue(shipmentData, 'delivery_agent_address', ''),
    delivery_agent_tel: getSafeValue(shipmentData, 'delivery_agent_tel', ''),
    delivery_agent_fax: getSafeValue(shipmentData, 'delivery_agent_fax', ''),
    
    // Footer
    jurisdiction: getSafeValue(shipmentData, 'jurisdiction', 'INDIAN'),
  };

  try {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          {/* Logo with absolute path fallback */}
          <Image 
            style={styles.logo} 
            src={logo}
            cache={false}
          />
          
          {/* Header */}
          <Text style={styles.header}>MULTIMODAL TRANSPORT DOCUMENT</Text>
          <View style={styles.companyHeader}>
            <Text style={{ fontSize: 9, fontWeight: 'bold' }}>SEAL FREIGHT FORWARDERS PVT. LTD.</Text>
            <Text style={styles.smallText}>T-2, IIIrd Floor, H Block Market, LSC Plot No. 7, Manish Complex</Text>
            <Text style={styles.smallText}>Sarita Vihar, New Delhi-110076 INDIA</Text>
            <Text style={styles.smallText}>Mob: +91 8468811866, Tel+ 91 022 27566678, 79</Text>
            <Text style={styles.smallText}>Email: info@seal.co.in, Website: www.sealfreight.com</Text>
            <Text style={styles.smallText}>MTO Registration No.: MTO/DGS/566/JAN/2028</Text>
            <Text style={styles.smallText}>CIN U63013DL1990PTC042315</Text>
          </View>
          
          <Text style={styles.mtdNumber}>MTD Number: {safeData.mtdNumber}</Text>

          {/* Two Column Layout for Shipper and Consignee */}
          <View style={styles.twoColumnLayout}>
            {/* Left Column */}
            <View style={styles.leftColumn}>
              {/* Shipper */}
              <View style={styles.boxBorder}>
                <Text style={styles.sectionTitle}>Shipper</Text>
                <Text style={styles.smallText}>{safeData.shipper}</Text>
                <Text style={styles.smallText}>{safeData.address}</Text>
                <Text style={styles.smallText}>TEL :{safeData.shipper_tel} FAX :{safeData.shipper_fax}</Text>
              </View>

              {/* Consignee */}
              <View style={styles.boxBorder}>
                <Text style={styles.sectionTitle}>Consignee (of order):</Text>
                <Text style={styles.smallText}>{safeData.consignee}</Text>
                <Text style={styles.smallText}>{safeData.consignee_address}</Text>
                <Text style={styles.smallText}>K.A- {safeData.consignee_contact}</Text>
                <Text style={styles.smallText}>TEL {safeData.consignee_tel}</Text>
              </View>

              {/* Notify Party */}
              <View style={styles.boxBorder}>
                <Text style={styles.sectionTitle}>Notify Party:</Text>
                <Text style={styles.smallText}>{safeData.notify_party}</Text>
                <Text style={styles.smallText}>{safeData.notify_party_address}</Text>
                <Text style={styles.smallText}>K.A- {safeData.notify_party_contact}</Text>
                <Text style={styles.smallText}>TEL {safeData.notify_party_tel}</Text>
              </View>
            </View>

            {/* Right Column */}
            <View style={styles.rightColumn}>
              <View style={styles.boxBorder}>
                <Text style={styles.smallText}>Shipment Reference No. :</Text>
                <Text style={styles.smallText}>{safeData.shipment_no}</Text>
              </View>
              
              <View style={[styles.boxBorder, { minHeight: 150 }]}>
                <Text style={styles.smallText}>transport and delivery as mentioned above unless otherwise stated. The</Text>
                <Text style={styles.smallText}>MTO in accordance with the provisions contained in the MTD undertake to</Text>
                <Text style={styles.smallText}>perform or to procure the performance of the multimodal transport form the</Text>
                <Text style={styles.smallText}>place at which the goods are taken in charge, to the place designated for</Text>
                <Text style={styles.smallText}>delivery and assumes responsibility for such transport</Text>
                <Text style={[styles.smallText, { marginTop: 5 }]}>One of the MTD(s) must be surrendered, duly endorsed in exchange for the</Text>
                <Text style={styles.smallText}>goods in witness where of the original MTD of this tenor and date have</Text>
                <Text style={styles.smallText}>been signed in the number indicated below, one of which being</Text>
                <Text style={styles.smallText}>accomplished, the other(s) to be void</Text>
              </View>
            </View>
          </View>

          {/* Transport Details */}
          <View style={styles.transportSection}>
            <View style={styles.transportRow}>
              <View style={[styles.transportCell, { width: '25%' }]}>
                <Text style={{ fontWeight: 'bold' }}>Place of Acceptance</Text>
                <Text>{safeData.placeOfAcceptance}</Text>
              </View>
              <View style={[styles.transportCell, { width: '25%' }]}>
                <Text style={{ fontWeight: 'bold' }}>Port of Loading</Text>
                <Text>{safeData.pol}</Text>
              </View>
              <View style={[styles.transportCell, { width: '25%' }]}>
                <Text style={{ fontWeight: 'bold' }}>Route / Place of Transhipment (if any)</Text>
                <Text>{safeData.transhipment}</Text>
              </View>
              <View style={[styles.transportCellLast, { width: '25%' }]}>
                <Text style={{ fontWeight: 'bold' }}>Modes / Means of Transport</Text>
                <Text>{safeData.mode_of_transport}</Text>
              </View>
            </View>
            <View style={styles.transportRow}>
              <View style={[styles.transportCell, { width: '25%' }]}>
                <Text style={{ fontWeight: 'bold' }}>Vessel</Text>
                <Text>{safeData.vessel}</Text>
              </View>
              <View style={[styles.transportCell, { width: '25%' }]}>
                <Text style={{ fontWeight: 'bold' }}>Port of Discharge</Text>
                <Text>{safeData.pod}</Text>
              </View>
              <View style={[styles.transportCell, { width: '25%' }]}>
                <Text style={{ fontWeight: 'bold' }}>Port of Delivery</Text>
                <Text>{safeData.pof}</Text>
              </View>
              <View style={[styles.transportCellLast, { width: '25%', borderBottom: 0 }]}>
                <Text> </Text>
              </View>
            </View>
          </View>

          {/* Goods Description */}
          <View style={styles.goodsSection}>
            <View style={styles.row}>
              <View style={{ width: '20%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Container No(s)</Text>
              </View>
              <View style={{ width: '20%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Marks & Number</Text>
              </View>
              <View style={{ width: '30%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Number of packages, kind of packages, general description of goods</Text>
              </View>
              <View style={{ width: '15%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Gross Weight</Text>
              </View>
              <View style={{ width: '15%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Measurement</Text>
              </View>
            </View>
            
            <View style={[styles.row, { marginTop: 5 }]}>
              <View style={{ width: '20%' }}>
                <Text style={styles.smallText}>Container No/Seal No</Text>
                <Text style={styles.smallText}>{safeData.containerNo}</Text>
                <Text style={styles.smallText}>{safeData.sealNo}</Text>
              </View>
              <View style={{ width: '20%' }}>
                <Text style={styles.smallText}>{safeData.marks}</Text>
                <Text style={styles.smallText}>11, 12, 13, 14 & 15</Text>
              </View>
              <View style={{ width: '30%' }}>
                <Text style={styles.smallText}>{safeData.packages}</Text>
                <Text style={[styles.smallText, { marginTop: 3 }]}>{safeData.description}</Text>
                <Text style={styles.smallText}>MAIN B/G RETAINER, REAR COVER, SUCTION VALVE BASE,</Text>
                <Text style={styles.smallText}>REAR BEARING COVER & REAR BEARING HOLDER)</Text>
                <Text style={[styles.smallText, { marginTop: 3 }]}>INV. NO.: {safeData.invoiceNo} DT. {safeData.invoiceDate}</Text>
                <Text style={styles.smallText}>S/B NO.: {safeData.sbNo} DT. {safeData.sbDate}</Text>
                <Text style={styles.smallText}>HS CODE: {safeData.hsCode}</Text>
                <Text style={[styles.smallText, { marginTop: 5 }]}>"ORIGIN THC PREPAID"</Text>
                <Text style={styles.smallText}>"OCEAN FREIGHT COLLECT"</Text>
                <Text style={styles.smallText}>"ALL DESTINATION CHARGES ON CONSIGNEE ACCOUNT"</Text>
              </View>
              <View style={{ width: '15%' }}>
                <Text style={styles.smallText}>{safeData.grossWeight}</Text>
                <Text style={[styles.smallText, { marginTop: 3 }]}>NET.WT.</Text>
                <Text style={styles.smallText}>{safeData.netWeight}</Text>
              </View>
              <View style={{ width: '15%' }}>
                <Text style={styles.smallText}>{safeData.measurement}</Text>
                <Text style={[styles.smallText, { marginTop: 3 }]}>FCL/FCL</Text>
                <Text style={styles.smallText}>CY/CY</Text>
              </View>
            </View>
            
            <View style={{ marginTop: 10 }}>
              <Text style={styles.smallText}>SAID TO CONTAIN SAID TO WEIGH/MEASURE</Text>
            </View>
          </View>

          {/* Bottom Section */}
          <View style={styles.bottomSection}>
            <View style={styles.row}>
              <View style={{ width: '33%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Place and Date of Issue</Text>
                <Text style={styles.smallText}>{safeData.place_of_issue} DT. {safeData.date_of_issue}</Text>
              </View>
              <View style={{ width: '33%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Freight Amount</Text>
                <Text style={styles.smallText}>{safeData.freight_amount}</Text>
              </View>
              <View style={{ width: '34%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Freight Payable at</Text>
                <Text style={styles.smallText}>{safeData.payable_at}</Text>
              </View>
            </View>
            
            <View style={[styles.row, { marginTop: 5 }]}>
              <View style={{ width: '100%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Number of Original MTD(S)</Text>
                <Text style={styles.smallText}>{safeData.number_of_originals}</Text>
              </View>
            </View>
          </View>

          {/* Delivery Agent */}
          <View style={styles.boxBorder}>
            <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Delivery Agent:</Text>
            <Text style={styles.smallText}>{safeData.delivery_agent}</Text>
            <Text style={styles.smallText}>{safeData.delivery_agent_address}</Text>
            <Text style={styles.smallText}>TEL : {safeData.delivery_agent_tel} FAX:{safeData.delivery_agent_fax}</Text>
          </View>

          {/* Footer Notes */}
          <View style={{ marginTop: 5 }}>
            <Text style={styles.smallText}>DESTINATION ANCILLARY CHARGES TO CONSIGNEE'S ACCOUNT</Text>
            <Text style={styles.smallText}>CONSIGNEE/CONSIGNOR ARE ADVISED TO PURCHASE COMPREHENSIVE</Text>
            <Text style={styles.smallText}>INSURANCE COVER TO PROTECT THEIR INTEREST IN ALL EVENTS"</Text>
            <Text style={[styles.smallText, { marginTop: 3 }]}>Particulars above furnished by Consignee / Consignor, Weight and Measurement of container not to be included</Text>
          </View>

          {/* Jurisdiction */}
          <View style={{ marginTop: 5 }}>
            <Text style={styles.smallText}>Subject to {safeData.jurisdiction} Jurisdiction</Text>
          </View>

          {/* Signature */}
          <View style={styles.signatureSection}>
            <Text>For Seal Freight Forwarders Pvt. Ltd.</Text>
            <Text style={{ marginTop: 20 }}>(Authorised Signatory)</Text>
          </View>
        </Page>
      </Document>
    );
  } catch (error) {
    console.error('PDF Generation Error:', error);
    // Return fallback PDF if generation fails
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={{ fontSize: 10, color: 'red' }}>Error generating PDF. Please try again.</Text>
          <Text style={{ fontSize: 8, marginTop: 10 }}>Error details: {error.message}</Text>
        </Page>
      </Document>
    );
  }
};

// ============ FIX: Add default props to prevent undefined values ============
PDFGenerator.defaultProps = {
  shipmentData: {},
};

export default PDFGenerator;