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
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [emailDialog, setEmailDialog] = useState(null); // { type: 'auto' | 'compose', data: excelData }
  const [emailConfig, setEmailConfig] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: 'DSR Report',
    body: 'Please find attached the DSR Report.',
    recipients: []
  });
  const [sendingEmail, setSendingEmail] = useState(false);

  // Function to format dates consistently
  const formatDate = useCallback((dateValue) => {
    if (!dateValue) return null;
    
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return dateValue;
      }
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch {
      return dateValue;
    }
  }, []);

  const extractDateFromTimestamp = useCallback((timestamp) => {
    if (!timestamp) return null;
    
    if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
      return timestamp;
    }
    
    if (typeof timestamp === 'string' && timestamp.includes('T')) {
      return timestamp.split('T')[0];
    }
    
    if (typeof timestamp === 'string') {
      const datePart = timestamp.split(' ')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return datePart;
      }
    }
    
    return formatDate(timestamp);
  }, [formatDate]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: shipmentsData, error: shipmentsError } = await supabase
        .from('shipments')
        .select('*')
        .order('job_no', { ascending: true });

      if (shipmentsError) throw shipmentsError;
      transformData(shipmentsData);

    } catch (err) {
      console.error('Error in fetchData:', err);
      setError(err.message);
      setLoading(false);
      
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
            Job: 1001,
            id: 1
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
    const transformedData = rawData.map((item, index) => ({
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
      id: item.id,
      originalData: item
    }));

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
      if (a[key] === null || a[key] === undefined) return direction === 'ascending' ? -1 : 1;
      if (b[key] === null || b[key] === undefined) return direction === 'ascending' ? 1 : -1;
      
      if (typeof a[key] === 'number' && typeof b[key] === 'number') {
        return direction === 'ascending' ? a[key] - b[key] : b[key] - a[key];
      }
      
      if (typeof a[key] === 'string' && typeof b[key] === 'string' && 
          /^\d{4}-\d{2}-\d{2}$/.test(a[key]) && /^\d{4}-\d{2}-\d{2}$/.test(b[key])) {
        return direction === 'ascending' ? 
          new Date(a[key]) - new Date(b[key]) : 
          new Date(b[key]) - new Date(a[key]);
      }
      
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

  // Edit functionality
  const startEditing = (id, field, value) => {
    setEditingCell({ id, field });
    setEditValue(value || '');
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingCell) return;

    try {
      setSaving(true);
      const { id, field } = editingCell;

      const rowData = data.find(item => item.id === id);
      if (!rowData) return;

      const fieldMapping = {
        'INVNO': 'invoice_no',
        'INVDT': 'invoice_date',
        'CONSIGNEE': 'consignee',
        'DESTINATION': 'destination',
        'GOODS': 'commodity',
        'GrossWeightKGS': 'gr_weight',
        'NETWEIGHT': 'net_weight',
        'TERM': 'incoterms',
        'SBILLNO': 'sb_no',
        'SBILLDT': 'sb_date',
        'STUFFINGDT': 'stuffing_date',
        'HANDOVERDT': 'ho_date',
        'SLINE': 's_line',
        'BKGNO': 'job_no',
        'CONTAINERNO': 'container_no',
        'CONTYPE': 'no_of_cntr',
        'RAILOUTDT': 'rail_out_date',
        'ARRIVAL': 'eta',
        'VESSEL': 'vessel',
        'VOY': 'voy',
        'ETD': 'etd',
        'SOB': 'sob',
        'ETA': 'eta',
        'MBHBLNO': 'mbl_no',
        'DT': 'hbl_dt',
        'REMARK': 'remarks',
        'Job': 'job_no'
      };

      const dbField = fieldMapping[field];
      if (!dbField) {
        throw new Error(`Field mapping not found for ${field}`);
      }

      let updateValue = editValue;
      
      if (['INVDT', 'SBILLDT', 'STUFFINGDT', 'HANDOVERDT', 'RAILOUTDT', 'ARRIVAL', 'ETD', 'SOB', 'ETA', 'DT'].includes(field)) {
        if (editValue) {
          updateValue = new Date(editValue).toISOString();
        } else {
          updateValue = null;
        }
      }

      if (['GrossWeightKGS', 'NETWEIGHT'].includes(field)) {
        updateValue = editValue ? parseFloat(editValue) : null;
      }

      const { error: updateError } = await supabase
        .from('shipments')
        .update({ [dbField]: updateValue })
        .eq('id', id);

      if (updateError) throw updateError;

      const updatedData = data.map(item => {
        if (item.id === id) {
          return {
            ...item,
            [field]: editValue,
            originalData: {
              ...item.originalData,
              [dbField]: updateValue
            }
          };
        }
        return item;
      });

      setData(updatedData);
      setFilteredData(updatedData);
      setEditingCell(null);
      setEditValue('');
      
    } catch (err) {
      console.error('Error saving edit:', err);
      setError(`Failed to save changes: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  // Excel generation function
  const generateExcelData = (dataToExport) => {
    return dataToExport.map(item => ({
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
  };

  // Export to Excel file
  const exportToExcelFile = (excelData, filename) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "DSR Report");
    XLSX.writeFile(wb, filename);
  };

  // Export selected with options
  const exportSelectedWithOptions = () => {
    if (selectedRows.size === 0) {
      alert("Please select at least one row to export.");
      return;
    }

    const selectedData = data.filter(item => selectedRows.has(item.id));
    const excelData = generateExcelData(selectedData);
    
    setEmailDialog({
      type: 'options',
      data: excelData,
      filename: `DSR_Report_Selected_${new Date().toISOString().split('T')[0]}.xlsx`,
      recordCount: selectedRows.size
    });
  };

  // Export all with options
  const exportAllWithOptions = () => {
    const excelData = generateExcelData(filteredData);
    
    setEmailDialog({
      type: 'options',
      data: excelData,
      filename: `DSR_Report_Full_${new Date().toISOString().split('T')[0]}.xlsx`,
      recordCount: filteredData.length
    });
  };

  // Send email via Gmail
  const sendEmail = async (excelData, filename, emailType = 'compose') => {
    try {
      setSendingEmail(true);

      // Convert Excel data to blob
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, "DSR Report");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      if (emailType === 'auto') {
        // Send email via your backend API
        await sendEmailViaAPI(blob, filename);
      } else {
        // Open Gmail compose window
        openGmailCompose(blob, filename);
      }

      setEmailDialog(null);
      alert(emailType === 'auto' ? 'Email sent successfully!' : 'Gmail compose window opened!');

    } catch (err) {
      console.error('Error sending email:', err);
      setError(`Failed to send email: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  // Send email via backend API
  const sendEmailViaAPI = async (fileBlob, filename) => {
    const formData = new FormData();
    formData.append('file', fileBlob, filename);
    formData.append('to', emailConfig.to);
    formData.append('cc', emailConfig.cc);
    formData.append('bcc', emailConfig.bcc);
    formData.append('subject', emailConfig.subject);
    formData.append('body', emailConfig.body);

    // Replace with your actual email sending endpoint
    const response = await fetch('/api/send-email', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to send email via API');
    }

    return response.json();
  };

  // Open Gmail compose window
  const openGmailCompose = (fileBlob, filename) => {
    // Create a download link first
    const url = URL.createObjectURL(fileBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Construct Gmail URL
    const subject = encodeURIComponent(emailConfig.subject);
    const body = encodeURIComponent(emailConfig.body + `\n\nFile: ${filename}`);
    const to = encodeURIComponent(emailConfig.to);
    const cc = encodeURIComponent(emailConfig.cc);
    const bcc = encodeURIComponent(emailConfig.bcc);

    let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
    
    if (cc) gmailUrl += `&cc=${cc}`;
    if (bcc) gmailUrl += `&bcc=${bcc}`;

    window.open(gmailUrl, '_blank');
  };

  // Quick email send with default settings
  const quickSendEmail = (excelData, filename) => {
    setEmailConfig(prev => ({
      ...prev,
      subject: `DSR Report - ${new Date().toLocaleDateString()}`,
      body: `Please find attached the DSR Report containing ${excelData.length} records.\n\nBest regards,\nDSR Team`
    }));
    sendEmail(excelData, filename, 'auto');
  };

  const retryFetch = () => {
    setRetryCount(prev => prev + 1);
  };

  // Render cell content
  const renderCellContent = (row, field) => {
    if (editingCell && editingCell.id === row.id && editingCell.field === field) {
      return (
        <div style={styles.editContainer}>
          <input
            type={field.includes('DT') ? 'date' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyPress}
            autoFocus
            style={styles.editInput}
          />
          <div style={styles.editButtons}>
            <button 
              onClick={saveEdit} 
              disabled={saving}
              style={styles.saveButton}
              title="Save (Enter)"
            >
              ✓
            </button>
            <button 
              onClick={cancelEditing}
              style={styles.cancelButton}
              title="Cancel (Esc)"
            >
              ✗
            </button>
          </div>
        </div>
      );
    }
    
    return (
      <div 
        onClick={() => startEditing(row.id, field, row[field])}
        style={styles.editableCell}
        title="Click to edit"
      >
        {row[field] || 'N/A'}
      </div>
    );
  };

  // Email Dialog Component
  const EmailDialog = () => {
    if (!emailDialog) return null;

    return (


          <div style={styles.dialogButtons}>
          
            
            <button
              onClick={() => sendEmail(emailDialog.data, emailDialog.filename, 'compose')}
              disabled={sendingEmail}
              style={styles.composeButton}
            >
              {sendingEmail ? 'Opening...' : 'Open Gmail Compose'}
            </button>
            
            <button
              onClick={() => exportToExcelFile(emailDialog.data, emailDialog.filename)}
              style={styles.downloadButton}
            >
              Download Excel File
            </button>
            
            <button
              onClick={() => setEmailDialog(null)}
              style={styles.cancelDialogButton}
            >
              Cancel
            </button>
          </div>
        
    );
  };

  if (loading) return <div style={styles.loading}>Loading data...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>DSR Report - Editable</h1>
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
              onClick={exportSelectedWithOptions}
              disabled={selectedRows.size === 0}
            >
              Export Selected ({selectedRows.size})
            </button>
            <button style={styles.exportAllButton} onClick={exportAllWithOptions}>
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
      
      {saving && (
        <div style={styles.savingIndicator}>
          Saving changes...
        </div>
      )}

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

      <EmailDialog />

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
              {editingCell && ` | Editing: ${editingCell.field}`}
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
                    <td style={styles.cell}>{renderCellContent(row, 'Job')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'INVNO')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'INVDT')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'CONSIGNEE')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'DESTINATION')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'GOODS')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'GrossWeightKGS')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'NETWEIGHT')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'TERM')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'SBILLNO')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'SBILLDT')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'STUFFINGDT')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'HANDOVERDT')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'SLINE')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'BKGNO')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'CONTAINERNO')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'CONTYPE')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'RAILOUTDT')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'ARRIVAL')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'VESSEL')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'VOY')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'ETD')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'SOB')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'ETA')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'MBHBLNO')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'DT')}</td>
                    <td style={styles.cell}>{renderCellContent(row, 'REMARK')}</td>
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
  // Email Dialog Styles
  dialogOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: 'white',
    padding: '30px',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
  },
  emailConfig: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: '20px 0',
  },
  emailInput: {
    padding: '8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
  },
  emailTextarea: {
    padding: '8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
    resize: 'vertical',
  },
  dialogButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  quickSendButton: {
    padding: '10px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  composeButton: {
    padding: '10px',
    backgroundColor: '#1e3a8a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  downloadButton: {
    padding: '10px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  cancelDialogButton: {
    padding: '10px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  // ... (keep all the existing table and other styles from previous implementation)
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
    minWidth: '2900px',
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
    padding: '4px',
    border: '1px solid #d9d9d9',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    position: 'relative',
  },
  editableCell: {
    cursor: 'pointer',
    padding: '4px',
    minHeight: '20px',
    border: '1px dashed transparent',
    borderRadius: '3px',
  },
  editContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  editInput: {
    flex: 1,
    padding: '2px 4px',
    border: '1px solid #1e3a8a',
    borderRadius: '3px',
    fontSize: '11px',
    minWidth: '0',
  },
  editButtons: {
    display: 'flex',
    gap: '2px',
  },
  saveButton: {
    padding: '2px 4px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '10px',
  },
  cancelButton: {
    padding: '2px 4px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '10px',
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
  savingIndicator: {
    textAlign: 'center',
    padding: '10px',
    backgroundColor: '#fff3cd',
    color: '#856404',
    border: '1px solid #ffeaa7',
    borderRadius: '5px',
    marginBottom: '10px',
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