import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { supabase } from '../lib/supabaseClient';
import './InvoicesPage.css';

// Lazy load the same PDFGenerator component
const PDFGenerator = lazy(() => import('./PDFGenerator.jsx'));

const InvoicesPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  
  // Shipment types for filtering
  const SHIPMENT_TYPES = ['ALL', 'AIR FREIGHT', 'SEA FREIGHT', 'TRANSPORT', 'OTHERS'];

  // Fetch invoices/shipments from Supabase
  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching invoices:', error);
        setError('Failed to load invoices. Please try again.');
        return;
      }
      
      console.log('Fetched shipments data:', data);
      
      // Safely map the data with null checks
      const mappedInvoices = (data || []).map(shipment => ({
        id: shipment.id,
        shipmentNo: shipment.shipment_no || `SHIP-${shipment.id?.toString()?.padStart(6, '0') || '000000'}`,
        jobNo: shipment.job_no || 'N/A',
        client: shipment.client || 'No Client',
        shipmentType: shipment.shipment_type || 'N/A',
        tradeDirection: shipment.trade_direction || 'N/A',
        branch: shipment.branch || 'N/A',
        department: shipment.department || 'N/A',
        por: shipment.por || 'N/A',
        pod: shipment.pod || 'N/A',
        pof: shipment.pof || 'N/A',
        etd: shipment.etd ? new Date(shipment.etd).toLocaleDateString() : 'N/A',
        eta: shipment.eta ? new Date(shipment.eta).toLocaleDateString() : 'N/A',
        createdAt: shipment.created_at ? new Date(shipment.created_at).toLocaleDateString() : 'N/A',
        mtdRegistrationNo: shipment.mtd_registration_no || 'N/A',
        freight: shipment.freight || 'N/A',
        hblNo: shipment.hbl_no || 'N/A',
        // Include all other fields for PDF generation
        ...shipment
      }));
      
      console.log('Mapped invoices:', mappedInvoices);
      setInvoices(mappedInvoices);
    } catch (error) {
      console.error('Error in fetchInvoices:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Safe filter function with null checks
  const filteredInvoices = invoices.filter(invoice => {
    // Safe string conversion function
    const safeToString = (value) => {
      if (value === null || value === undefined) return '';
      return String(value).toLowerCase();
    };
    
    // Get safe values
    const safeShipmentNo = safeToString(invoice.shipmentNo);
    const safeClient = safeToString(invoice.client);
    const safeJobNo = safeToString(invoice.jobNo);
    const safeMtdNo = safeToString(invoice.mtdRegistrationNo);
    const safeShipmentType = safeToString(invoice.shipmentType);
    const safeCreatedAt = safeToString(invoice.createdAt);
    const safeEtd = safeToString(invoice.etd);
    const safeEta = safeToString(invoice.eta);
    
    const matchesSearch = searchTerm === '' || 
      safeShipmentNo.includes(searchTerm.toLowerCase()) ||
      safeClient.includes(searchTerm.toLowerCase()) ||
      safeJobNo.includes(searchTerm.toLowerCase()) ||
      safeMtdNo.includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || 
      safeShipmentType === filterType.toLowerCase();
    
    const matchesDate = filterDate === '' || 
      safeCreatedAt.includes(filterDate) ||
      safeEtd.includes(filterDate) ||
      safeEta.includes(filterDate);
    
    return matchesSearch && matchesType && matchesDate;
  });

  // Handle refresh
  const handleRefresh = () => {
    fetchInvoices();
  };

  if (loading) {
    return (
      <div className="invoice-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="invoice-page">
      <div className="invoice-header">
        <div className="header-content">
          <h1>Invoice & Shipment Records</h1>
          <p className="subtitle">View and download shipment invoices and documents</p>
        </div>
        
        <div className="header-actions">
          <button className="refresh-btn" onClick={handleRefresh}>
            Refresh
          </button>
          <div className="stats">
            <span className="stat-item">
              <strong>{invoices.length}</strong> Total Shipments
            </span>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by Shipment No, Client, Job No, or MTD No..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <span className="search-icon">🔍</span>
        </div>
        
        <div className="filter-controls">
          <div className="filter-group">
            <label>Shipment Type:</label>
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              {SHIPMENT_TYPES.map(type => (
                <option key={type} value={type === 'ALL' ? 'all' : type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label>Date:</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="date-input"
            />
          </div>
          
          <div className="filter-group">
            <button 
              className="clear-filters-btn"
              onClick={() => {
                setSearchTerm('');
                setFilterType('all');
                setFilterDate('');
              }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
          <button onClick={() => setError(null)} className="dismiss-btn">
            Dismiss
          </button>
        </div>
      )}

      {/* Invoices Grid */}
      <div className="invoices-grid">
        {filteredInvoices.length > 0 ? (
          filteredInvoices.map((invoice) => (
            <div key={invoice.id} className="invoice-card">
              <div className="invoice-card-header">
                <div className="invoice-number">
                  <div>
                    <h3>{invoice.shipmentNo}</h3>
                    <p className="job-no">Job: {invoice.jobNo}</p>
                  </div>
                </div>
                <div className="status-badge">
                  <span className={`type-badge ${(invoice.shipmentType || '').replace(' ', '-').toLowerCase()}`}>
                    {invoice.shipmentType}
                  </span>
                </div>
              </div>
              
              <div className="invoice-card-body">
                <div className="invoice-details">
                  <div className="detail-row">
                    <span className="label">Client:</span>
                    <span className="value">{invoice.client}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Branch:</span>
                    <span className="value">{invoice.branch}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Trade Direction:</span>
                    <span className="value direction-badge">{invoice.tradeDirection}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">POR:</span>
                    <span className="value">{invoice.por}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">POD:</span>
                    <span className="value">{invoice.pod}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">ETD:</span>
                    <span className="value">{invoice.etd}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">ETA:</span>
                    <span className="value">{invoice.eta}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Created:</span>
                    <span className="value">{invoice.createdAt}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">MTD Registration:</span>
                    <span className="value mtd-no">{invoice.mtdRegistrationNo}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">HBL No:</span>
                    <span className="value">{invoice.hblNo}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Freight:</span>
                    <span className="value freight-value">{invoice.freight}</span>
                  </div>
                </div>
                
                <div className="invoice-actions">
                  <Suspense fallback={<span>Loading PDF...</span>}>
                    <PDFDownloadLink
                      document={<PDFGenerator shipmentData={invoice} />}
                      fileName={`${invoice.shipmentNo}_Invoice.pdf`}
                      className="download-btn"
                    >
                      {({ loading }) => (
                        <>
                          {loading ? 'Generating...' : 'Download Invoice'}
                        </>
                      )}
                    </PDFDownloadLink>
                  </Suspense>
                </div>
              </div>
              
              <div className="invoice-card-footer">
                <div className="footer-info">
                  <span className="department-badge">{invoice.department}</span>
                  <span className="pof-info">POF: {invoice.pof}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="no-results">
            <div className="no-results-content">
              <h3>No invoices found</h3>
              <p>No shipments match your current filters. Try adjusting your search criteria.</p>
              {searchTerm || filterType !== 'all' || filterDate ? (
                <button 
                  className="clear-search-btn"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterType('all');
                    setFilterDate('');
                  }}
                >
                  Clear all filters
                </button>
              ) : (
                <p className="hint">Shipments will appear here once they are created in the New Shipments page.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="page-footer">
        <div className="footer-content">
          <div className="summary">
            <p>
              Showing <strong>{filteredInvoices.length}</strong> of <strong>{invoices.length}</strong> shipments
            </p>
          </div>
          <div className="export-options">
            <button className="export-btn" onClick={() => {/* Add export functionality */}}>
              Export to Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicesPage;