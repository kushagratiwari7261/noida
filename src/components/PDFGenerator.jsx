import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';

// Import the logo directly
import logo from './seal.png';

// Register fonts for better consistency
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Bold.ttf', fontWeight: 'bold' },
  ]
});

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 8,
    fontFamily: 'Helvetica',
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

const PDFGenerator = ({ shipmentData = {} }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Logo */}
        <Image 
          style={styles.logo} 
          src={logo}
        />
        
        {/* Header */}
        <Text style={styles.header}>MULTIMODAL TRANSPORT DOCUMENT</Text>
        <View style={styles.companyHeader}>
          <Text style={{ fontSize: 9, fontWeight: 'bold' }}>SEAL FREIGHT FORWARDERS PVT. LTD.</Text>
          <Text style={styles.smallText}>T-2, IIIrd Floor, H Block Market, LSC Plot No. 7, Manish Complex</Text>
          <Text style={styles.smallText}>Sarita Vihar, New Delhi-110076 INDIA</Text>
          <Text style={styles.smallText}>Mob: +91 8468811866, Tel+ 91 022 27566678, 79</Text>
          <Text style={styles.smallText}>Email: info@seal.co.in, Website: www.sealfreight.com</Text>
          <Text style={styles.smallText}>MTO Rgistration No.: MTO/DGS/566/JAN/2028</Text>
          <Text style={styles.smallText}>CIN U63013DL1990PTC042315</Text>
        </View>
        
        <Text style={styles.mtdNumber}>MTD Number: {shipmentData.mtdNumber}</Text>

        {/* Two Column Layout for Shipper and Consignee */}
        <View style={styles.twoColumnLayout}>
          {/* Left Column */}
          <View style={styles.leftColumn}>
            {/* Shipper */}
            <View style={styles.boxBorder}>
              <Text style={styles.sectionTitle}>Shipper</Text>
              <Text style={styles.smallText}>{shipmentData.shipper}</Text>
              <Text style={styles.smallText}>{shipmentData.address}</Text>
              <Text style={styles.smallText}>TEL :{shipmentData.shipper_tel} FAX :{shipmentData.shipper_fax}</Text>
            </View>

            {/* Consignee */}
            <View style={styles.boxBorder}>
              <Text style={styles.sectionTitle}>Consignee (of order):</Text>
              <Text style={styles.smallText}>{shipmentData.consignee}</Text>
              <Text style={styles.smallText}>{shipmentData.consignee_address}</Text>
              <Text style={styles.smallText}>K.A- {shipmentData.consignee_contact}</Text>
              <Text style={styles.smallText}>TEL {shipmentData.consignee_tel}</Text>
            </View>

            {/* Notify Party */}
            <View style={styles.boxBorder}>
              <Text style={styles.sectionTitle}>Notify Party:</Text>
              <Text style={styles.smallText}>{shipmentData.notify_party}</Text>
              <Text style={styles.smallText}>{shipmentData.notify_party_address}</Text>
              <Text style={styles.smallText}>K.A- {shipmentData.notify_party_contact}</Text>
              <Text style={styles.smallText}>TEL {shipmentData.notify_party_tel}</Text>
            </View>
          </View>

          {/* Right Column */}
          <View style={styles.rightColumn}>
            <View style={styles.boxBorder}>
              <Text style={styles.smallText}>Shipment Reference No. :</Text>
              <Text style={styles.smallText}>{shipmentData.shipment_no}</Text>
            </View>
            
            <View style={[styles.boxBorder, { minHeight: 150 }]}>
              <Text style={styles.smallText}>transport and delivery as mentioned above unless otherwise stated. The</Text>
              <Text style={styles.smallText}>MTO in accordance with the provisions contained in the MTD undertake to</Text>
              <Text style={styles.smallText}>perform or to procure the performance of the multimodal transport form the</Text>
              <Text style={styles.smallText}>place at which the goods are taken in charge, to the place designated for</Text>
              <Text style={styles.smallText}>delivery and assumes responsibilityt for such transport</Text>
              <Text style={[styles.smallText, { marginTop: 5 }]}>One of the MTD(s) must be surrendered, duly endorsed in exchange for the</Text>
              <Text style={styles.smallText}>gods in withness where on of the original MTD of theis tenor and date have</Text>
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
              <Text>{shipmentData.placeOfAcceptance}</Text>
            </View>
            <View style={[styles.transportCell, { width: '25%' }]}>
              <Text style={{ fontWeight: 'bold' }}>Port of Loading</Text>
              <Text>{shipmentData.pol}</Text>
            </View>
            <View style={[styles.transportCell, { width: '25%' }]}>
              <Text style={{ fontWeight: 'bold' }}>Rote / Place of Transhipment (if any)</Text>
              <Text>{shipmentData.transhipment}</Text>
            </View>
            <View style={[styles.transportCellLast, { width: '25%' }]}>
              <Text style={{ fontWeight: 'bold' }}>Modes / Means of Transport</Text>
              <Text>{shipmentData.mode_of_transport}</Text>
            </View>
          </View>
          <View style={styles.transportRow}>
            <View style={[styles.transportCell, { width: '25%' }]}>
              <Text style={{ fontWeight: 'bold' }}>Vessel</Text>
              <Text>{shipmentData.vessel}</Text>
            </View>
            <View style={[styles.transportCell, { width: '25%' }]}>
              <Text style={{ fontWeight: 'bold' }}>Port of Discharge</Text>
              <Text>{shipmentData.pod}</Text>
            </View>
            <View style={[styles.transportCell, { width: '25%' }]}>
              <Text style={{ fontWeight: 'bold' }}>Port of Delivery</Text>
              <Text>{shipmentData.pof}</Text>
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
              <Text style={styles.smallText}>{shipmentData.containerNo || 'WHSU2286815'}</Text>
              <Text style={styles.smallText}>{shipmentData.sealNo || '20SD86 WHA1382852'}</Text>
            </View>
            <View style={{ width: '20%' }}>
              <Text style={styles.smallText}>{shipmentData.marks || 'BOX NO.1,2,3,4,5,6, 7,8,9,10,'}</Text>
              <Text style={styles.smallText}>11, 12, 13, 14 & 15</Text>
            </View>
            <View style={{ width: '30%' }}>
              <Text style={styles.smallText}>{shipmentData.packages || '15 (FIFTEEN BOXES ONLY)'}</Text>
              <Text style={[styles.smallText, { marginTop: 3 }]}>{shipmentData.description || 'CI CASTING (SIDE COVER R, SIDE COVER C, BALANCE WEIGHT,'}</Text>
              <Text style={styles.smallText}>MAIN B/G RETAINER, REAR COVER, SUCTION VALVE BASE,</Text>
              <Text style={styles.smallText}>REAR BEARING COVER & REAR BEARING HOLDER)</Text>
              <Text style={[styles.smallText, { marginTop: 3 }]}>INV. NO.: {shipmentData.invoiceNo || '12/FS/EXP/2025-2026'} DT. {shipmentData.invoiceDate || '13/08/2025'}</Text>
              <Text style={styles.smallText}>S/B NO.: {shipmentData.sbNo || '446801'} DT. {shipmentData.sbDate || '14/08/2025'}</Text>
              <Text style={styles.smallText}>HS CODE: {shipmentData.hsCode || '73251000'}</Text>
              <Text style={[styles.smallText, { marginTop: 5 }]}>"ORIGIN THC PREPAID"</Text>
              <Text style={styles.smallText}>"OCEAN FREIGHT COLLECT"</Text>
              <Text style={styles.smallText}>"ALL DESTINATION CHARGES ON CONSIGNEE ACCOUNT"</Text>
            </View>
            <View style={{ width: '15%' }}>
              <Text style={styles.smallText}>{shipmentData.grossWeight || '8774.000 KGS'}</Text>
              <Text style={[styles.smallText, { marginTop: 3 }]}>NET.WT.</Text>
              <Text style={styles.smallText}>{shipmentData.netWeight || '8290.000 KGS'}</Text>
            </View>
            <View style={{ width: '15%' }}>
              <Text style={styles.smallText}>{shipmentData.measurement || '10.000 CBM'}</Text>
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
              <Text style={styles.smallText}>{shipmentData.place_of_issue} DT. {shipmentData.date_of_issue}</Text>
            </View>
            <View style={{ width: '33%' }}>
              <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Freight Amount</Text>
              <Text style={styles.smallText}>{shipmentData.freight_amount}</Text>
            </View>
            <View style={{ width: '34%' }}>
              <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Fright Payable at</Text>
              <Text style={styles.smallText}>{shipmentData.payable_at}</Text>
            </View>
          </View>
          
          <View style={[styles.row, { marginTop: 5 }]}>
            <View style={{ width: '100%' }}>
              <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Number of Original MTD(S)</Text>
              <Text style={styles.smallText}>{shipmentData.number_of_originals}</Text>
            </View>
          </View>
        </View>

        {/* Delivery Agent */}
        <View style={styles.boxBorder}>
          <Text style={{ fontWeight: 'bold', fontSize: 7 }}>Delivery Agent:</Text>
          <Text style={styles.smallText}>{shipmentData.delivery_agent}</Text>
          <Text style={styles.smallText}>{shipmentData.delivery_agent_address}</Text>
          <Text style={styles.smallText}>TEL : {shipmentData.delivery_agent_tel} FAX:{shipmentData.delivery_agent_fax}</Text>
        </View>

        {/* Footer Notes */}
        <View style={{ marginTop: 5 }}>
          <Text style={styles.smallText}>DESTINATION ANCILLARY CHARGES TO CONSIGNEE'S ACCOUNT</Text>
          <Text style={styles.smallText}>CONSIGNEE/CONSIGNOR ARE ADVISED TO PURCHASE COMPREHENSIVE</Text>
          <Text style={styles.smallText}>INSURANCE COVER TO PROTECT THEIR INTEREST IN ALL EVENTS"</Text>
          <Text style={[styles.smallText, { marginTop: 3 }]}>Particulars above furnished by Consignee / Consignor, Weight and Measurment of container not to be included</Text>
        </View>

        {/* Jurisdiction */}
        <View style={{ marginTop: 5 }}>
          <Text style={styles.smallText}>Subject to {shipmentData.jurisdiction} Jurisdiction</Text>
        </View>

        {/* Signature */}
        <View style={styles.signatureSection}>
          <Text>For Seal Freight Forwarders Pvt. Ltd.</Text>
          <Text style={{ marginTop: 20 }}>(Authorised Signatory)</Text>
        </View>
      </Page>
    </Document>
  );
};

export default PDFGenerator;