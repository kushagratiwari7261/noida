// src/components/PDFGenerator.js
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';

// Import the logo directly
import logo from './seal.png';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  section: {
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
    borderBottom: '1pt solid black',
    paddingBottom: 10,
  },
  logo: {
    width: 120,
    height: 50,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
    marginTop: 10,
    borderBottom: '0.5pt solid #333',
    paddingBottom: 3,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  col: {
    flex: 1,
  },
  label: {
    fontWeight: 'bold',
    marginRight: 5,
  },
  table: {
    display: 'table',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    marginTop: 10,
    marginBottom: 10,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableColHeader: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: '#f0f0f0',
    padding: 5,
    fontWeight: 'bold',
  },
  tableCol: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: 'grey',
  },
  note: {
    fontStyle: 'italic',
    marginTop: 5,
    fontSize: 9,
  },
  signature: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBox: {
    width: '40%',
    borderTop: '1pt solid black',
    paddingTop: 5,
    textAlign: 'center',
  },
});

const PDFGenerator = ({ shipmentData }) => {
  // Format dates for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy');
    } catch (error) {
      return dateString;
    }
  };

  // Extract data with proper field mappings
  const getField = (fieldName, defaultValue = 'N/A') => {
    return shipmentData[fieldName] || defaultValue;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header with logo and title */}
        <View style={styles.header}>
          <Image 
            style={styles.logo} 
            src={logo}
          />
          <View>
            <Text style={styles.title}>MULTIMODAL TRANSPORT DOCUMENT</Text>
            <Text>MTD Registration No.: {getField('mtdNumber')}</Text>
            <Text>CN: {getField('cnNumber')}</Text>
            <Text>Shipment No: {getField('shipment_no')}</Text>
            <Text>Job No: {getField('job_no')}</Text>
          </View>
        </View>

        {/* Shipper Information */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Shipper</Text>
          <Text>{getField('shipper')}</Text>
          <Text>{getField('address')}</Text>
          <Text>TEL: {getField('shipper_tel')} FAX: {getField('shipper_fax')}</Text>
        </View>

        {/* Freight Forwarder Information */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Scal Freight</Text>
          <Text>SEAL FREIGHT FORWARDERS PVT. LTD.</Text>
          <Text>T-2, Illrd Floor, H Block Market, LSC Plot No. 7, Manish Complex</Text>
          <Text>Sarita Plaza, New Delhi-110076 INDIA</Text>
          <Text>Mob.: +91 8483811885, Tel: +91 822 27586278, 79 Email: info@seal.co.in, Website: www.sealfreight.com</Text>
        </View>

        {/* Consignee Information */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Consignee (of order):</Text>
          <Text>{getField('consignee')}</Text>
          <Text>{getField('consignee_address')}</Text>
          <Text>K.A. {getField('consignee_contact')}</Text>
          <Text>TEL {getField('consignee_tel')}</Text>
        </View>

        {/* Notify Party */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Notify Party:</Text>
          <Text>{getField('notify_party')}</Text>
          <Text>{getField('notify_party_address')}</Text>
          <Text>K.A. {getField('notify_party_contact')}</Text>
          <Text>TEL {getField('notify_party_tel')}</Text>
        </View>

        {/* Plan of Acceptance and Shipping Details */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Plan of Acceptance</Text>
          <Text>{getField('planOfAcceptance')}</Text>
          
          <View style={[styles.row, {marginTop: 10}]}>
            <View style={styles.col}>
              <Text><Text style={styles.label}>Vessel:</Text> {getField('vessel')}</Text>
            </View>
            <View style={styles.col}>
              <Text><Text style={styles.label}>Port of Loading:</Text> {getField('pol')}</Text>
            </View>
          </View>
          
          <View style={styles.row}>
            <View style={styles.col}>
              <Text><Text style={styles.label}>Port of Discharge:</Text> {getField('pod')}</Text>
            </View>
            <View style={styles.col}>
              <Text><Text style={styles.label}>Port of Delivery:</Text> {getField('pof')}</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text><Text style={styles.label}>ETD:</Text> {formatDate(getField('etd'))}</Text>
            </View>
            <View style={styles.col}>
              <Text><Text style={styles.label}>ETA:</Text> {formatDate(getField('eta'))}</Text>
            </View>
          </View>
        </View>

        {/* Goods Description */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Container Marks & Number No(s)</Text>
          <Text>SAID TO CONTAIN</Text>
          <Text>{getField('no_of_packages')} packages</Text>
          <Text>{getField('description')}</Text>
          <Text>INV. NO.: {getField('invoiceNo')} DT. {formatDate(getField('invoiceDate'))}</Text>
          <Text>S/B NO.: {getField('sbNo')} DT. {formatDate(getField('sbDate'))}</Text>
          <Text>HS CODE: {getField('hs_code')}</Text>
          <Text>Commodity: {getField('commodity')}</Text>
        </View>

        {/* Weight and Measurement */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>WEIGHT/MEASUREMENT</Text>
          <Text>Gross Weight: {getField('gross_weight')} kg</Text>
          <Text>Net Weight: {getField('netWeight')} kg</Text>
          <Text>Volume: {getField('volume')} m³</Text>
          <Text>Chargeable Weight: {getField('chargeable_weight')} kg</Text>
        </View>

        {/* Container Details */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Container No/Seal No</Text>
          <Text>{getField('containerNo')}</Text>
          <Text>No. of Containers: {getField('noOfCntr')}</Text>
          <Text>Container Details: {getField('container_details')}</Text>
        </View>

        {/* Payment Terms */}
        <View style={styles.section}>
          <Text>Incoterms: {getField('incoterms')}</Text>
          <Text>Service Type: {getField('service_type')}</Text>
          <Text>Freight: {getField('freight')}</Text>
          <Text style={styles.note}>DESTINATION ANCILLARY CHARGES TO CONSIGNEE'S ACCOUNT</Text>
          <Text style={styles.note}>CONSIGNEE/CONSIGNOR ARE ADVISED TO PURCHASE COMPREHENSIVE INSURANCE COVER TO PROTECT THEIR INTEREST IN ALL EVENTS</Text>
        </View>

        {/* Footer Information */}
        <View style={styles.section}>
          <Text>Draft</Text>
          <Text>Particulars above furnished by Consignee / Consumer, Weight and Measurement of container not to be included</Text>
          
          <View style={styles.row}>
            <View style={styles.col}>
              <Text>Freight Amount: {getField('freight_amount')}</Text>
              <Text>Freight Payable at: {getField('payable_at')}</Text>
            </View>
          </View>
        </View>

        {/* Delivery Agent */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Delivery Agent:</Text>
          <Text>{getField('delivery_agent')}</Text>
          <Text>{getField('delivery_agent_address')}</Text>
          <Text>TEL: {getField('delivery_agent_tel')} FAX: {getField('delivery_agent_fax')}</Text>
        </View>

        {/* Additional Information */}
        <View style={styles.section}>
          <Text>Carrier: {getField('carrier')}</Text>
          <Text>MBL No: {getField('mblNo')}</Text>
          <Text>HBL No: {getField('hbl_no')}</Text>
          <Text>Remarks: {getField('remarks')}</Text>
        </View>

        {/* Jurisdiction */}
        <View style={styles.section}>
          <Text>Subject to {getField('jurisdiction')} Jurisdiction</Text>
        </View>

        {/* Signatures */}
        <View style={styles.signature}>
          <View style={styles.signatureBox}>
            <Text>For Seal Freight Forwarders Pvt. Ltd.</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text>Authorized Signature</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Generated on {format(new Date(), 'dd/MM/yyyy HH:mm')} | Seal Freight Forwarders Pvt. Ltd.
        </Text>
      </Page>
    </Document>
  );
};

export default PDFGenerator;