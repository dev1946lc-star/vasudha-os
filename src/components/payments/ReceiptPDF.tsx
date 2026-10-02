import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 12,
    fontFamily: 'Helvetica',
    color: '#1e293b', // slate-800
  },
  header: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 20,
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: 'contain',
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
    letterSpacing: 2,
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e40af', // blue-800
    marginBottom: 4,
  },
  companyDetails: {
    fontSize: 10,
    color: '#64748b',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  label: {
    color: '#64748b',
    width: '40%',
  },
  value: {
    width: '60%',
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
  },
  amountBox: {
    backgroundColor: '#f8fafc',
    padding: 20,
    marginVertical: 20,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  amountLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: '#16a34a', // emerald-600
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  }
});

export type ReceiptData = {
  payment_id: string;
  payment_date: string;
  amount: number;
  payment_mode: string;
  reference_number: string | null;
  restaurant: {
    name: string;
    phone: string | null;
  };
  company: {
    name: string;
    address: string | null;
    gst_number: string | null;
    logo_url: string | null;
  };
  invoice: {
    invoice_number: string;
  };
};

export const ReceiptPDF = ({ data }: { data: ReceiptData }) => (
  <Document>
    <Page size="A5" style={styles.page}>
      
      {/* Header */}
      <View style={styles.header}>
        {data.company.logo_url && (
          <Image src={data.company.logo_url} style={styles.logo} />
        )}
        <Text style={styles.title}>PAYMENT RECEIPT</Text>
        <Text style={styles.companyName}>{data.company.name}</Text>
        {data.company.gst_number && (
          <Text style={styles.companyDetails}>GSTIN: {data.company.gst_number}</Text>
        )}
        {data.company.address && (
          <Text style={styles.companyDetails}>{data.company.address}</Text>
        )}
      </View>

      {/* Amount Received Box */}
      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>AMOUNT RECEIVED</Text>
        <Text style={styles.amountValue}>₹{data.amount.toFixed(2)}</Text>
      </View>

      {/* Details */}
      <View style={styles.row}>
        <Text style={styles.label}>Receipt Date</Text>
        <Text style={styles.value}>{new Date(data.payment_date).toLocaleDateString()}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Received From</Text>
        <Text style={styles.value}>{data.restaurant.name}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Payment Mode</Text>
        <Text style={styles.value}>{data.payment_mode.toUpperCase()}</Text>
      </View>
      
      {data.reference_number && (
        <View style={styles.row}>
          <Text style={styles.label}>Reference Number</Text>
          <Text style={styles.value}>{data.reference_number}</Text>
        </View>
      )}

      <View style={styles.row}>
        <Text style={styles.label}>Applied to Invoice</Text>
        <Text style={styles.value}>{data.invoice.invoice_number}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Receipt ID</Text>
        <Text style={[styles.value, { fontSize: 8, color: '#94a3b8' }]}>{data.payment_id}</Text>
      </View>

      <View style={styles.footer}>
        <Text>Thank you for your payment.</Text>
        <Text style={{ marginTop: 4 }}>This is a system generated digital receipt.</Text>
      </View>
    </Page>
  </Document>
);
