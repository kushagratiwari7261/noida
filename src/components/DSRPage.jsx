import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import * as XLSX from 'xlsx';

const DSRHondaReport = () => {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Function to format dates consistently
  const formatDate = useCallback((dateValue) => {
    if (!dateValue) return null;
    
    try {
      // Handle both Date objects and string representations
      const date = new Date(dateValue);
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return dateValue; // Return original value if it's not a valid date
      }
      
      // Format as YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch {
      return dateValue; // Return original value if parsing fails
    }
  }, []);

  // Function to extract just the date part from a timestamp
  const extractDateFromTimestamp = useCallback((timestamp) => {
    if (!timestamp) return null;
    
    // If it's already a date string in YYYY-MM-DD format
    if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
      return timestamp;
    }
    
    // If it's a timestamp with time component
    if (typeof timestamp === 'string' && timestamp.includes('T')) {
      return timestamp.split('T')[0];
    }
    
    // If it's a full timestamp string
    if (typeof timestamp === 'string') {
      const datePart = timestamp.split(' ')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return datePart;
      }
    }
    
    // For all other cases, try to format it
    return formatDate(timestamp);
  }, [formatDate]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching data from Supabase...');

      // Query the shipments table directly since it contains all the needed data
      const { data: shipmentsData, error: shipmentsError } = await supabase
        .from('shipments')
        .select('*')
        .order('job_no', { ascending: true });

      if (shipmentsError) throw shipmentsError;

      console.log('Shipments data:', shipmentsData);
      
      // Transform the data for display
      transformData(shipmentsData);

    } catch (err) {
      console.error('Error in fetchData:', err);
      setError(err.message);
      setLoading(false);
      
      // Use sample data only as last resort
      if (retryCount >= 2) {
        const sampleData = [
          {
            SNO: 1,
            INVNO: "10H-3130-01",
            INVDT: "2021-09-07",
            CONSIGNEE: "AMERICAN HONDA",
            DESTINATION: "HOUSTON",
            GOODS: "IC ENGINES PETROL",
            GrossWeightKGS: 13760,
            NETWEIGHT: 13200,
            TERM: "CIF",
            SBILLNO: 4438452,
            SBILLDT: "2021-09-08",
            STUFFINGDT: "2021-09-08",
            HANDOVERDT: "2021-09-09",
            SLINE: "CMA",
            BKGNO: "CAD0558889",
            CONTAINERNO: "TCNU5219260",
            CONTYPE: "40'",
            RAILOUTDT: "2021-09-11",
            ARRIVAL: "2021-09-13",
            VESSEL: "CMA CGM OTELLO",
            VOY: "0MXA3W1MA",
            ETD: "2021-09-18",
            SOB: "2021-09-18",
            ETA: "2021-12-05",
            MBHBLNO: "CAD0558889",
            DT: "2021-09-18",
            REMARK: "SHIPMENT DELIVER TO CONSIGNEE ON 08TH DEC",
            Job: 1001
          },
        ];
        setData(sampleData);
        setFilteredData(sampleData);
        setError("Using sample data. Could not connect to database: " + err.message);
      }
    }
  }, [retryCount]);

  useEffect(() => {
    fetchData();
  }, [fetchData, retryCount]);

  const transformData = useCallback((rawData) => {
  // Transform the shipment data
  const transformedData = rawData.map((item, index) => {
    // Extract values from shipment data with proper mapping
    return {
      SNO: index + 1,
      INVNO: item.invoice_no || item.invoiceNo || item.shipment_no || null,
      INVDT: extractDateFromTimestamp(item.invoice_date || item.invoiceDate || item.shipment_date),
      CONSIGNEE: item.consignee || null,
      DESTINATION: item.destination || item.pod || item.pof || null,
      GOODS: item.commodity || item.description || null,
      GrossWeightKGS: item.gr_weight || item.grWeight || item.gross_weight || null,
      NETWEIGHT: item.net_weight || item.netWeight || item.gross_weight || null,
      TERM: item.incoterms || item.terms || null,
      SBILLNO: item.sb_no || item.sbNo || item.hbl_no || null,
      SBILLDT: extractDateFromTimestamp(item.sb_date || item.sbDate || item.shipment_date),
      STUFFINGDT: extractDateFromTimestamp(item.stuffing_date || item.stuffingDate),
      HANDOVERDT: extractDateFromTimestamp(item.ho_date || item.hoDate),
      SLINE: item.s_line || item.sLine || item.carrier || null,
      BKGNO: item.job_no || null,
      CONTAINERNO: item.container_no || item.containerNo || "N/A",
      CONTYPE: item.no_of_cntr || item.noOfCntr ? `${item.no_of_cntr || item.noOfCntr} containers` : "N/A",
      RAILOUTDT: extractDateFromTimestamp(item.rail_out_date || item.railOutDate),
      ARRIVAL: extractDateFromTimestamp(item.eta),
      VESSEL: item.vessel || item.vessel_name_summary || null,
      VOY: item.voy || null,
      ETD: extractDateFromTimestamp(item.etd),
      SOB: extractDateFromTimestamp(item.sob),
      ETA: extractDateFromTimestamp(item.eta),
      MBHBLNO: item.mbl_no || item.mblNo || item.hbl_no || null,
      DT: extractDateFromTimestamp(item.hbl_dt || item.hblDt || item.shipment_date),
      REMARK: item.remarks || null,
      Job: item.job_no || null,
      id: item.id // Add the id for row selection
    };
  });

  console.log('Final transformed data:', transformedData);
  setData(transformedData);
  setFilteredData(transformedData);
  setLoading(false);
}, [extractDateFromTimestamp]);
  useEffect(() => {
    let result = data;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        Object.values(item).some(val =>
          val && val.toString().toLowerCase().includes(term)
        )
      );
    }
    setFilteredData(result);
  }, [searchTerm, data]);

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });

    const sortedData = [...filteredData].sort((a, b) => {
      // Handle null/undefined values
      if (a[key] === null || a[key] === undefined) return direction === 'ascending' ? -1 : 1;
      if (b[key] === null || b[key] === undefined) return direction === 'ascending' ? 1 : -1;
      
      // Handle numeric values
      if (typeof a[key] === 'number' && typeof b[key] === 'number') {
        return direction === 'ascending' ? a[key] - b[key] : b[key] - a[key];
      }
      
      // Handle date values (strings in YYYY-MM-DD format)
      if (typeof a[key] === 'string' && typeof b[key] === 'string' && 
          /^\d{4}-\d{2}-\d{2}$/.test(a[key]) && /^\d{4}-\d{2}-\d{2}$/.test(b[key])) {
        return direction === 'ascending' ? 
          new Date(a[key]) - new Date(b[key]) : 
          new Date(b[key]) - new Date(a[key]);
      }
      
      // Handle string values
      const aValue = a[key].toString().toLowerCase();
      const bValue = b[key].toString().toLowerCase();
      
      if (aValue < bValue) return direction === 'ascending' ? -1 : 1;
      if (aValue > bValue) return direction === 'ascending' ? 1 : -1;
      return 0;
    });

    setFilteredData(sortedData);
  };

  const toggleRowSelection = (id) => {
    const newSelectedRows = new Set(selectedRows);
    if (newSelectedRows.has(id)) {
      newSelectedRows.delete(id);
    } else {
      newSelectedRows.add(id);
    }
    setSelectedRows(newSelectedRows);
  };

  const toggleAllRows = () => {
    if (selectedRows.size === filteredData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredData.map(item => item.id)));
    }
  };

  const exportSelectedToExcel = () => {
    if (selectedRows.size === 0) {
      alert("Please select at least one row to export.");
      return;
    }

    const wb = XLSX.utils.book_new();
    
    // Filter data to only selected rows
    const selectedData = data.filter(item => selectedRows.has(item.id));
    
    // Create a copy of data with more readable headers
    const excelData = selectedData.map(item => ({
      'S/NO': item.SNO,
      'Job No': item.Job,
      'INV NO.': item.INVNO,
      'INV DT': item.INVDT,
      'CONSIGNEE': item.CONSIGNEE,
      'DESTINATION': item.DESTINATION,
      'GOODS': item.GOODS,
      'Gross Weight KGS': item.GrossWeightKGS,
      'NET WEIGHT (KGS)': item.NETWEIGHT,
      'TERM': item.TERM,
      'SBILL NO.': item.SBILLNO,
      'SBILL DT': item.SBILLDT,
      'STUFFING DT.': item.STUFFINGDT,
      'HANDOVER DT.': item.HANDOVERDT,
      'S/LINE': item.SLINE,
      'BKG NO': item.BKGNO,
      'CONTAINER NO.': item.CONTAINERNO,
      'CON TYPE': item.CONTYPE,
      'RAIL OUT DT.': item.RAILOUTDT,
      'ARRIVAL @ MUNDRA/PIPAVAV': item.ARRIVAL,
      'VESSEL': item.VESSEL,
      'VOY': item.VOY,
      'E.T.D': item.ETD,
      'S.O.B': item.SOB,
      'E.T.A': item.ETA,
      'MB/HBL NO': item.MBHBLNO,
      'DT.': item.DT,
      'REMARK': item.REMARK
    }));
    
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "DSR Report");
    XLSX.writeFile(wb, "DSR_Report_Selected.xlsx");
  };

  const exportAllToExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Create a copy of data with more readable headers
    const excelData = filteredData.map(item => ({
      'S/NO': item.SNO,
      'Job No': item.Job,
      'INV NO.': item.INVNO,
      'INV DT': item.INVDT,
      'CONSIGNEE': item.CONSIGNEE,
      'DESTINATION': item.DESTINATION,
      'GOODS': item.GOODS,
      'Gross Weight KGS': item.GrossWeightKGS,
      'NET WEIGHT (KGS)': item.NETWEIGHT,
      'TERM': item.TERM,
      'SBILL NO.': item.SBILLNO,
      'SBILL DT': item.SBILLDT,
      'STUFFING DT.': item.STUFFINGDT,
      'HANDOVER DT.': item.HANDOVERDT,
      'S/LINE': item.SLINE,
      'BKG NO': item.BKGNO,
      'CONTAINER NO.': item.CONTAINERNO,
      'CON TYPE': item.CONTYPE,
      'RAIL OUT DT.': item.RAILOUTDT,
      'ARRIVAL @ MUNDRA/PIPAVAV': item.ARRIVAL,
      'VESSEL': item.VESSEL,
      'VOY': item.VOY,
      'E.T.D': item.ETD,
      'S.O.B': item.SOB,
      'E.T.A': item.ETA,
      'MB/HBL NO': item.MBHBLNO,
      'DT.': item.DT,
      'REMARK': item.REMARK
    }));
    
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "DSR ");
    XLSX.writeFile(wb, "DSR.xlsx");
  };

  const retryFetch = () => {
    setRetryCount(prev => prev + 1);
  };

  if (loading) return <div style={styles.loading}>Loading data...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>DSR </h1>
        <div style={styles.controls}>
          <input
            type="text"
            placeholder="Search across all columns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          <div style={styles.buttonGroup}>
            <button 
              style={styles.exportButton} 
              onClick={exportSelectedToExcel}
              disabled={selectedRows.size === 0}
            >
              Export Selected ({selectedRows.size})
            </button>
            <button style={styles.exportAllButton} onClick={exportAllToExcel}>
              Export All
            </button>
            {error && (
              <button style={styles.retryButton} onClick={retryFetch}>
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
      
      {error && (
        <div style={styles.error}>
          {error}
          <button 
            onClick={() => setError(null)} 
            style={styles.dismissButton}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={styles.tableContainer}>
        {filteredData.length === 0 && !loading ? (
          <div style={styles.noData}>
            No data found {searchTerm ? 'matching your search' : ''}
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                style={styles.clearSearchButton}
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={styles.resultsInfo}>
              Showing {filteredData.length} of {data.length} records
              {searchTerm && ` matching "${searchTerm}"`}
              {selectedRows.size > 0 && ` | ${selectedRows.size} selected`}
            </div>
            <table style={styles.table}>
              <thead>
                <tr style={styles.headerRow}>
                  <th style={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      checked={selectedRows.size === filteredData.length && filteredData.length > 0}
                      onChange={toggleAllRows}
                      title="Select all rows"
                    />
                  </th>
                  {[
                    'SNO', 'Job', 'INVNO', 'INVDT', 'CONSIGNEE', 'DESTINATION', 
                    'GOODS', 'GrossWeightKGS', 'NETWEIGHT', 'TERM', 'SBILLNO', 
                    'SBILLDT', 'STUFFINGDT', 'HANDOVERDT', 'SLINE', 'BKGNO', 
                    'CONTAINERNO', 'CONTYPE', 'RAILOUTDT', 'ARRIVAL', 'VESSEL', 
                    'VOY', 'ETD', 'SOB', 'ETA', 'MBHBLNO', 'DT', 'REMARK'
                  ].map(column => (
                    <th 
                      key={column} 
                      style={styles.cell} 
                      onClick={() => handleSort(column)}
                      title={`Sort by ${column}`}
                    >
                      {column}
                      {sortConfig.key === column && (
                        <span>{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => (
                  <tr 
                    key={row.id} 
                    style={index % 2 === 0 ? styles.evenRow : styles.oddRow}
                    className={selectedRows.has(row.id) ? styles.selectedRow : ''}
                  >
                    <td style={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={() => toggleRowSelection(row.id)}
                        title="Select this row"
                      />
                    </td>
                    <td style={styles.cell}>{row.SNO}</td>
                    <td style={styles.cell}>{row.Job || 'N/A'}</td>
                    <td style={styles.cell}>{row.INVNO || 'N/A'}</td>
                    <td style={styles.cell}>{row.INVDT || 'N/A'}</td>
                    <td style={styles.cell}>{row.CONSIGNEE || 'N/A'}</td>
                    <td style={styles.cell}>{row.DESTINATION || 'N/A'}</td>
                    <td style={styles.cell}>{row.GOODS || 'N/A'}</td>
                    <td style={styles.cell}>{row.GrossWeightKGS || 'N/A'}</td>
                    <td style={styles.cell}>{row.NETWEIGHT || 'N/A'}</td>
                    <td style={styles.cell}>{row.TERM || 'N/A'}</td>
                    <td style={styles.cell}>{row.SBILLNO || 'N/A'}</td>
                    <td style={styles.cell}>{row.SBILLDT || 'N/A'}</td>
                    <td style={styles.cell}>{row.STUFFINGDT || 'N/A'}</td>
                    <td style={styles.cell}>{row.HANDOVERDT || 'N/A'}</td>
                    <td style={styles.cell}>{row.SLINE || 'N/A'}</td>
                    <td style={styles.cell}>{row.BKGNO || 'N/A'}</td>
                    <td style={styles.cell}>{row.CONTAINERNO || 'N/A'}</td>
                    <td style={styles.cell}>{row.CONTYPE || 'N/A'}</td>
                    <td style={styles.cell}>{row.RAILOUTDT || 'N/A'}</td>
                    <td style={styles.cell}>{row.ARRIVAL || 'N/A'}</td>
                    <td style={styles.cell}>{row.VESSEL || 'N/A'}</td>
                    <td style={styles.cell}>{row.VOY || 'N/A'}</td>
                    <td style={styles.cell}>{row.ETD || 'N/A'}</td>
                    <td style={styles.cell}>{row.SOB || 'N/A'}</td>
                    <td style={styles.cell}>{row.ETA || 'N/A'}</td>
                    <td style={styles.cell}>{row.MBHBLNO || 'N/A'}</td>
                    <td style={styles.cell}>{row.DT || 'N/A'}</td>
                    <td style={styles.cell}>{row.REMARK || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    fontFamily: 'Arial, sans-serif',
    padding: '20px',
    backgroundColor: '#fff',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    padding: '10px',
    backgroundColor: '#e6f2ff',
    borderRadius: '5px',
    flexWrap: 'wrap',
    gap: '10px',
  },
  title: {
    color: '#1e3a8a',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: 0,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  searchInput: {
    padding: '8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
    minWidth: '200px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  exportButton: {
    padding: '8px 16px',
    backgroundColor: '#1e3a8a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  exportAllButton: {
    padding: '8px 16px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  retryButton: {
    padding: '8px 16px',
    backgroundColor: '#ffc107',
    color: 'black',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  tableContainer: {
    overflowX: 'auto',
    border: '1px solid #d9d9d9',
    borderRadius: '5px',
    marginTop: '20px',
    position: 'relative',
  },
  resultsInfo: {
    padding: '10px',
    backgroundColor: '#f0f0f0',
    borderBottom: '1px solid #d9d9d9',
    fontSize: '14px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    minWidth: '2900px', // Accommodate all columns + checkbox column
  },
  headerRow: {
    backgroundColor: '#1e3a8a',
    color: 'white',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  checkboxCell: {
    padding: '8px',
    border: '1px solid #d9d9d9',
    textAlign: 'center',
    width: '40px',
    cursor: 'pointer',
  },
  cell: {
    padding: '8px',
    border: '1px solid #d9d9d9',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  evenRow: {
    backgroundColor: '#f2f2f2',
  },
  oddRow: {
    backgroundColor: '#ffffff',
  },
  selectedRow: {
    backgroundColor: '#e3f2fd',
  },
  loading: {
    textAlign: 'center',
    padding: '20px',
    fontSize: '18px',
  },
  error: {
    textAlign: 'center',
    padding: '20px',
    fontSize: '18px',
    color: 'red',
    backgroundColor: '#ffeeee',
    border: '1px solid #ffcccc',
    borderRadius: '5px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dismissButton: {
    padding: '5px 10px',
    backgroundColor: '#ffcccc',
    border: '1px solid #ff9999',
    borderRadius: '3px',
    cursor: 'pointer',
  },
  noData: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '16px',
    color: '#666',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  clearSearchButton: {
    padding: '5px 10px',
    backgroundColor: '#e6f2ff',
    border: '1px solid #1e3a8a',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};

export default DSRHondaReport;