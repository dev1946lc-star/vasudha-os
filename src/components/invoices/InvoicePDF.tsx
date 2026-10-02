import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// Standard fonts are usually built-in.
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  companyInfo: {
    flex: 1,
  },
  logo: {
    width: 80,
    height: 80,
    objectFit: 'contain',
    marginBottom: 10,
  },
  companyName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e40af', // Blue-800
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#475569', // Slate-600
  },
  section: {
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  box: {
    width: '45%',
  },
  bold: {
    fontWeight: 'bold',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  text: {
    marginBottom: 2,
    lineHeight: 1.4,
  },
  table: {
    width: '100%',
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    padding: 6,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    padding: 6,
  },
  // Seven columns now carry the tax split, so the description yields width and
  // the numeric columns share the rest.
  col1: { width: '24%' },
  col2: { width: '9%', textAlign: 'right' },
  col3: { width: '8%', textAlign: 'right' },
  col4: { width: '12%', textAlign: 'right' },
  col5: { width: '13%', textAlign: 'right' },
  col6: { width: '17%', textAlign: 'right' },
  col7: { width: '13%', textAlign: 'right' },
  
  totals: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totalsBox: {
    width: '40%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 2,
    borderTopColor: '#1e40af',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
  }
});

export type InvoiceLineItem = {
  name: string;
  hsn_code: string;
  /** Net of returns: what the customer is actually charged for. */
  quantity: number;
  unit_price: number;
  amount: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_amount: number;
  return_quantity: number;
};

export type InvoiceData = {
  invoice_number: string;
  invoice_date: string;
  /** NOT NULL since migration 29; the ageing and overdue clock runs from here. */
  due_date: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_amount: number;
  company: {
    name: string;
    address: string;
    gst_number: string;
    logo_url?: string;
  };
  restaurant: {
    name: string;
    address: string;
    phone: string;
  };
  items: InvoiceLineItem[];
};

export const InvoicePDF = ({ data }: { data: InvoiceData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.companyInfo}>
          {data.company.logo_url && (
            <Image src={data.company.logo_url} style={styles.logo} />
          )}
          <Text style={styles.companyName}>{data.company.name}</Text>
          <Text style={styles.text}>{data.company.address || 'Address not provided'}</Text>
          <Text style={styles.text}>GSTIN: {data.company.gst_number || 'N/A'}</Text>
        </View>
        <View style={{ textAlign: 'right' }}>
          <Text style={styles.invoiceTitle}>TAX INVOICE</Text>
          <Text style={styles.text}>Invoice #: {data.invoice_number}</Text>
          <Text style={styles.text}>Date: {new Date(data.invoice_date).toLocaleDateString()}</Text>
        </View>
      </View>

      {/* Bill To */}
      <View style={styles.section}>
        <View style={styles.box}>
          <Text style={styles.bold}>Bill To:</Text>
          <Text style={styles.bold}>{data.restaurant.name}</Text>
          <Text style={styles.text}>{data.restaurant.address}</Text>
          <Text style={styles.text}>Phone: {data.restaurant.phone}</Text>
        </View>
      </View>

      {/* Table */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.col1}>Item Description</Text>
          <Text style={styles.col2}>HSN/SAC</Text>
          <Text style={styles.col3}>Qty</Text>
          <Text style={styles.col4}>Rate (₹)</Text>
          <Text style={styles.col5}>Taxable (₹)</Text>
          <Text style={styles.col6}>GST (₹)</Text>
          <Text style={styles.col7}>Total (₹)</Text>
        </View>

        {data.items.map((item, i) => {
          // One figure on the invoice, whichever way the split falls. Showing a
          // zero-valued IGST line next to a zero-valued CGST line would imply the
          // customer is exempt rather than that the supply is intra-state.
          const tax = item.cgst + item.sgst + item.igst;
          const taxLabel =
            item.igst > 0
              ? `IGST ${item.gst_rate}%`
              : `CGST ${item.gst_rate / 2}% + SGST ${item.gst_rate / 2}%`;

          return (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.col1}>
                {item.name}
                {/* A returned line is charged at net quantity, so say so on the
                    face of the invoice rather than leaving a discrepancy for the
                    customer to query. */}
                {item.return_quantity > 0
                  ? ` (${item.return_quantity} returned, not charged)`
                  : ''}
              </Text>
              <Text style={styles.col2}>{item.hsn_code || '-'}</Text>
              <Text style={styles.col3}>{item.quantity}</Text>
              <Text style={styles.col4}>{item.unit_price.toFixed(2)}</Text>
              <Text style={styles.col5}>{item.amount.toFixed(2)}</Text>
              <Text style={styles.col6}>{`${tax.toFixed(2)} (${taxLabel})`}</Text>
              <Text style={styles.col7}>{item.total_amount.toFixed(2)}</Text>
            </View>
          );
        })}
      </View>

      {/* Totals */}
      <View style={styles.totals}>
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>₹{data.subtotal.toFixed(2)}</Text>
          </View>
          {data.igst > 0 ? (
            <View style={styles.totalRow}>
              <Text>IGST</Text>
              <Text>₹{data.igst.toFixed(2)}</Text>
            </View>
          ) : (
            // Inter-state invoices carry IGST at the full rate and no CGST/SGST;
            // intra-state ones are the reverse. Showing a zero for the absent one
            // would misrepresent which regime the supply fell under.
            <>
              <View style={styles.totalRow}>
                <Text>CGST</Text>
                <Text>₹{data.cgst.toFixed(2)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text>SGST</Text>
                <Text>₹{data.sgst.toFixed(2)}</Text>
              </View>
            </>
          )}
          <View style={styles.grandTotal}>
            <Text>Total Amount</Text>
            <Text>₹{data.total_amount.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      {/* Payment terms. due_date drives ageing, so it belongs on the document a
          customer holds, not only in the database. */}
      {data.due_date ? (
        <Text style={[styles.text, { marginTop: 12 }]}>
          Payment due by {new Date(data.due_date).toLocaleDateString('en-IN')}. Please quote{' '}
          {data.invoice_number} with any payment.
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Text>This is a computer-generated invoice and does not require a physical signature.</Text>
      </View>
    </Page>
  </Document>
);
