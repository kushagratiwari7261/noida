import React, { useState, useEffect } from "react";
import { supabase } from '../lib/supabaseClient';

const CustomerPage = () => {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewModal, setViewModal] = useState(false);
const [viewingCustomer, setViewingCustomer] = useState(null);
const handleView = (customer) => {
  setViewingCustomer(customer);
  fetchCustomerFiles(customer.id);
  setViewModal(true);
};
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [files, setFiles] = useState({
    excelFile: null,
    pdfFile: null,
    panScan: null,
    cancelledCheque: null,
    gstRegistration: null,
    msmeCertificate: null
  });

  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [formData, setFormData] = useState({
    vendorName: "",
    country: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    postalCode: "",
    contactPerson: "",
    telephone: "",
    mobile: "",
    email: "",
    bankAccountNumber: "",
    beneficiaryAccountName: "",
    bankName: "",
    bankAddress: "",
    bankBranchState: "",
    bankBranchName: "",
    bankMicrCode: "",
    bankRtgsIfscCode: "",
    accountType: "",
    currency: "",
    panNumber: "",
    tanNumber: "",
    gstNumber: "",
    gstinDivision: "",
    hsnCode: "",
    vendorType: "",
    gstNotApplicableReason: "",
    msmeVendor: "",
    msmeCertificationDate: "",
    msmeRegNo: "",
    declaration: false
  });

  // Function to ensure bucket exists
  const ensureBucketExists = async () => {
    try {
      // Try to list buckets to check if our bucket exists
      const { data: buckets, error } = await supabase.storage.listBuckets();
      
      if (error && !error.message.includes('bucket')) {
        throw error;
      }
      
      const bucketExists = buckets?.some(bucket => bucket.name === 'vendor-files');
      
      if (!bucketExists) {
        // Create the bucket if it doesn't exist
        const { error: createError } = await supabase.storage.createBucket('vendor-files', {
          public: true,
          fileSizeLimit: 52428800, // 50MB limit
        });
        
        if (createError) throw createError;
        console.log('Bucket created successfully');
      }
    } catch (error) {
      console.error('Error ensuring bucket exists:', error);
    }
  };

  // Fetch customers from Supabase
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('vendorName', { ascending: true });

      if (error) throw error;
      
      setCustomers(data || []);
      setFilteredCustomers(data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (editingCustomer) {
      fetchCustomerFiles(editingCustomer.id);
    }
  }, [editingCustomer]);

  const fetchCustomerFiles = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_files')
        .select('*')
        .eq('vendor_id', customerId);
      
      if (error) throw error;

      if (data && data.length > 0) {
        const fileData = data[0];
        setFiles({
          excelFile: fileData.excel_file ? { name: 'Excel File', url: fileData.excel_file } : null,
          pdfFile: fileData.pdf_file ? { name: 'PDF File', url: fileData.pdf_file } : null,
          panScan: fileData.pan_scan ? { name: 'PAN Scan', url: fileData.pan_scan } : null,
          cancelledCheque: fileData.cancelled_cheque ? { name: 'Cancelled Cheque', url: fileData.cancelled_cheque } : null,
          gstRegistration: fileData.gst_registration ? { name: 'GST Registration', url: fileData.gst_registration } : null,
          msmeCertificate: fileData.msme_certificate ? { name: 'MSME Certificate', url: fileData.msme_certificate } : null
        });
      }
    } catch (error) {
      console.error("Error fetching customer files:", error);
    }
  };

  const handleFileUpload = async (file, fileType, customerId) => {
    try {
      setUploading(true);
      setUploadProgress(prev => ({ ...prev, [fileType]: 0 }));
      
      // Ensure bucket exists before uploading
      await ensureBucketExists();
      
      // Generate a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${fileType}_${customerId || 'new'}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `vendor-documents/${fileName}`;
      
      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('vendor-files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (uploadError) throw uploadError;
      
      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('vendor-files')
        .getPublicUrl(filePath);
      
      // Update files state
      setFiles(prev => ({ ...prev, [fileType]: { name: file.name, url: publicUrl, path: filePath } }));
      
      // If we're editing an existing customer, update the database
      if (customerId) {
        await updateFileRecord(fileType, publicUrl, filePath, customerId);
      }
      
    } catch (error) {
      console.error(`Error uploading ${fileType}:`, error);
      alert(`Error uploading file: ${error.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(prev => ({ ...prev, [fileType]: null }));
    }
  };

  const updateFileRecord = async (fileType, url, path, customerId) => {
    try {
      // Map fileType to correct column names
      const columnMap = {
        excelFile: { url: 'excel_file', path: 'excel_path' },
        pdfFile: { url: 'pdf_file', path: 'pdf_path' },
        panScan: { url: 'pan_scan', path: 'pan_path' },
        cancelledCheque: { url: 'cancelled_cheque', path: 'cheque_path' },
        gstRegistration: { url: 'gst_registration', path: 'gst_path' },
        msmeCertificate: { url: 'msme_certificate', path: 'msme_path' }
      };
      
      const columnNames = columnMap[fileType];
      
      if (!columnNames) {
        throw new Error(`Unknown file type: ${fileType}`);
      }
      
      // Check if record exists
      const { data: existingRecord } = await supabase
        .from('vendor_files')
        .select('id')
        .eq('vendor_id', customerId)
        .single();
      
      const updateData = {
        [columnNames.url]: url,
        [columnNames.path]: path
      };
      
      if (existingRecord) {
        // Update existing record
        const { error } = await supabase
          .from('vendor_files')
          .update(updateData)
          .eq('vendor_id', customerId);
        
        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase
          .from('vendor_files')
          .insert([{ 
            vendor_id: customerId,
            ...updateData
          }]);
        
        if (error) throw error;
      }
    } catch (error) {
      console.error("Error updating file record:", error);
    }
  };

   const handleFileRemove = async (fileType, customerId) => {
    try {
      // First check if we have a file to remove
      if (files[fileType]?.path) {
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('vendor-files')
          .remove([files[fileType].path]);
        
        if (storageError) throw storageError;
        
        // Update database if customer exists
        if (customerId) {
          // Map fileType to correct column names
          const columnMap = {
            excelFile: { url: 'excel_file', path: 'excel_path' },
            pdfFile: { url: 'pdf_file', path: 'pdf_path' },
            panScan: { url: 'pan_scan', path: 'pan_path' },
            cancelledCheque: { url: 'cancelled_cheque', path: 'cheque_path' },
            gstRegistration: { url: 'gst_registration', path: 'gst_path' },
            msmeCertificate: { url: 'msme_certificate', path: 'msme_path' }
          };
          
          const columnNames = columnMap[fileType];
          
          if (columnNames) {
            const { error: dbError } = await supabase
              .from('vendor_files')
              .update({ 
                [columnNames.url]: null,
                [columnNames.path]: null
              })
              .eq('vendor_id', customerId);
            
            if (dbError) throw dbError;
          }
        }
        
        // Update local state
        setFiles(prev => ({ 
          ...prev, 
          [fileType]: null 
        }));
        
        // Show success message
        alert(`${fileType} removed successfully`);
      } else {
        // If no file path, just remove from local state
        setFiles(prev => ({ 
          ...prev, 
          [fileType]: null 
        }));
      }
    } catch (error) {
      console.error(`Error removing ${fileType}:`, error);
      alert(`Error removing file: ${error.message}`);
    }
  };

  // Fetch countries on component mount
  useEffect(() => {
    fetchCustomers();
    fetchCountries();
    ensureBucketExists(); // Ensure bucket exists on component mount
  }, []);

  // Fetch states when country changes
  useEffect(() => {
    if (formData.country) {
      fetchStates(formData.country);
    }
  }, [formData.country]);

  // Handle search functionality
  useEffect(() => {
    const filtered = customers.filter(customer => 
      customer.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredCustomers(filtered);
  }, [searchTerm, customers]);

  const fetchCountries = async () => {
    try {
      const response = await fetch("https://restcountries.com/v3.1/all");
      const data = await response.json();
      const sortedCountries = data
        .map(country => country.name.common)
        .sort();
      setCountries(sortedCountries);
    } catch (error) {
      console.error("Error fetching countries:", error);
    }
  };

  const fetchStates = async (country) => {
    try {
      const sampleStates = [
        "State 1", "State 2", "State 3", "State 4", "State 5"
      ];
      setStates(sampleStates);
    } catch (error) {
      console.error("Error fetching states:", error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleAddNew = () => {
    setFormData({
      vendorName: "",
      country: "",
      address1: "",
      address2: "",
      city: "",
      state: "",
      postalCode: "",
      contactPerson: "",
      telephone: "",
      mobile: "",
      email: "",
      bankAccountNumber: "",
      beneficiaryAccountName: "",
      bankName: "",
      bankAddress: "",
      bankBranchState: "",
      bankBranchName: "",
      bankMicrCode: "",
      bankRtgsIfscCode: "",
      accountType: "",
      currency: "",
      panNumber: "",
      tanNumber: "",
      gstNumber: "",
      gstinDivision: "",
      hsnCode: "",
      vendorType: "",
      gstNotApplicableReason: "",
      msmeVendor: "",
      msmeCertificationDate: "",
      msmeRegNo: "",
      declaration: false
    });
    setFiles({
      excelFile: null,
      pdfFile: null,
      panScan: null,
      cancelledCheque: null,
      gstRegistration: null,
      msmeCertificate: null
    });
    setEditingCustomer(null);
    setShowModal(true);
  };

  const handleEdit = (customer) => {
    setFormData(customer);
    setEditingCustomer(customer);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this vendor?")) {
      try {
        const { error } = await supabase
          .from('vendors')
          .delete()
          .eq('id', id);

        if (error) throw error;

        // Refresh the customer list
        fetchCustomers();
      } catch (error) {
        console.error("Error deleting vendor:", error);
        setError(error.message);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    
    // Convert empty strings to null for date fields
    const processedData = {
      ...formData,
      msmeCertificationDate: formData.msmeCertificationDate || null
    };
    
    try {
      let customerId;
      
      if (editingCustomer) {
        // Update existing vendor
        const { data, error } = await supabase
          .from('vendors')
          .update(processedData)
          .eq('id', editingCustomer.id)
          .select();

        if (error) throw error;
        customerId = editingCustomer.id;
      } else {
        // Insert new vendor
        const { data, error } = await supabase
          .from('vendors')
          .insert([processedData])
          .select();

        if (error) throw error;
        customerId = data[0].id;
      }
      
      // Process file records for the customer
      if (customerId) {
        // Create or update file record with vendor ID
        const fileRecord = {
          vendor_id: customerId,
          excel_file: files.excelFile?.url || null,
          excel_path: files.excelFile?.path || null,
          pdf_file: files.pdfFile?.url || null,
          pdf_path: files.pdfFile?.path || null,
          pan_scan: files.panScan?.url || null,
          pan_path: files.panScan?.path || null,
          cancelled_cheque: files.cancelledCheque?.url || null,
          cheque_path: files.cancelledCheque?.path || null,
          gst_registration: files.gstRegistration?.url || null,
          gst_path: files.gstRegistration?.path || null,
          msme_certificate: files.msmeCertificate?.url || null,
          msme_path: files.msmeCertificate?.path || null
        };
        
        // Check if record exists
        const { data: existingRecord } = await supabase
          .from('vendor_files')
          .select('id')
          .eq('vendor_id', customerId)
          .single();
        
        if (existingRecord) {
          // Update existing record
          const { error } = await supabase
            .from('vendor_files')
            .update(fileRecord)
            .eq('vendor_id', customerId);
          
          if (error) throw error;
        } else {
          // Create new record
          const { error } = await supabase
            .from('vendor_files')
            .insert([fileRecord]);
          
          if (error) throw error;
        }
      }
    
      // Reset form and close modal
      setFormData({
        vendorName: "",
        country: "",
        address1: "",
        address2: "",
        city: "",
        state: "",
        postalCode: "",
        contactPerson: "",
        telephone: "",
        mobile: "",
        email: "",
        bankAccountNumber: "",
        beneficiaryAccountName: "",
        bankName: "",
        bankAddress: "",
        bankBranchState: "",
        bankBranchName: "",
        bankMicrCode: "",
        bankRtgsIfscCode: "",
        accountType: "",
        currency: "",
        panNumber: "",
        tanNumber: "",
        gstNumber: "",
        gstinDivision: "",
        hsnCode: "",
        vendorType: "",
        gstNotApplicableReason: "",
        msmeVendor: "",
        msmeCertificationDate: "",
        msmeRegNo: "",
        declaration: false
      });
      
      setFiles({
        excelFile: null,
        pdfFile: null,
        panScan: null,
        cancelledCheque: null,
        gstRegistration: null,
        msmeCertificate: null
      });
      
      setShowModal(false);
      setEditingCustomer(null);
      
      // Refresh the customer list
      fetchCustomers();
    } catch (error) {
      console.error("Error saving vendor:", error);
      setError(error.message);
    }
  };

  // File upload component
  const FileUploadField = ({ label, fileType, required = false }) => (
    <div className="form-group">
      <label>{label} {required && '*'}</label>
      <div className="file-upload-container">
        {files[fileType] ? (
          <div className="file-preview">
            <span className="file-name">{files[fileType].name}</span>
            <div className="file-actions">
              <button 
                type="button" 
                className="btn btn-sm btn-outline"
                onClick={() => window.open(files[fileType].url, '_blank')}
              >
                View
              </button>
              <button 
                type="button" 
                className="btn btn-sm btn-danger"
                onClick={() => handleFileRemove(fileType, editingCustomer?.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="file-input-wrapper">
            <input
              type="file"
              id={fileType}
              onChange={(e) => {
                if (e.target.files.length > 0) {
                  handleFileUpload(
                    e.target.files[0], 
                    fileType, 
                    editingCustomer?.id
                  );
                }
              }}
              disabled={uploading}
            />
            <label htmlFor={fileType} className="file-input-label">
              Choose File
            </label>
          </div>
        )}
        {uploadProgress[fileType] !== undefined && uploadProgress[fileType] !== null && (
          <div className="upload-progress">
            <div 
              className="progress-bar" 
              style={{ width: `${uploadProgress[fileType]}%` }}
            >
              {uploadProgress[fileType]}%
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) return <div className="loading">Loading vendors...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="customer-management">
      <div className="page-header">
        <h1>Vendor Management</h1>
        <button className="btn btn-primary" onClick={handleAddNew}>
          Add New Vendor
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search vendors by name, email, or contact person..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="customers-table-container">
        <table className="customers-table">
          <thead>
            <tr>
              <th>Vendor Name</th>
              <th>Contact Person</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>City</th>
              <th>Country</th>
              <th>Actions</th>
            </tr>
          </thead>
          
<tbody>
  {filteredCustomers.length > 0 ? (
    filteredCustomers.map((customer) => (
      <tr key={customer.id} onClick={() => handleView(customer)} style={{cursor: 'pointer'}}>
        <td>{customer.vendorName}</td>
        <td>{customer.contactPerson}</td>
        <td>{customer.email}</td>
        <td>{customer.mobile}</td>
        <td>{customer.city}</td>
        <td>{customer.country}</td>
        <td>
          <button 
            className="btn btn-sm btn-outline"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(customer);
            }}
          >
            Edit
          </button>
          <button 
            className="btn btn-sm btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(customer.id);
            }}
          >
            Delete
          </button>
        </td>
      </tr>
    ))
  ) : (    <tr>
                <td colSpan="7" className="no-data">
                  No vendors found. {searchTerm ? "Try a different search." : "Add a new vendor to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* View Vendor Details Modal */}
{viewModal && viewingCustomer && (
  <div className="modal-overlay">
    <div className="modal large-modal">
      <h2>Vendor Details: {viewingCustomer.vendorName}</h2>
      <div className="vendor-details">
        <div className="details-section">
          <h3>Basic Information</h3>
          <div className="details-row">
            <div className="detail-item">
              <label>Vendor Name:</label>
              <span>{viewingCustomer.vendorName}</span>
            </div>
            <div className="detail-item">
              <label>Country:</label>
              <span>{viewingCustomer.country}</span>
            </div>
          </div>
          
          <div className="detail-item">
            <label>Address Line 1:</label>
            <span>{viewingCustomer.address1}</span>
          </div>
          
          <div className="detail-item">
            <label>Address Line 2:</label>
            <span>{viewingCustomer.address2}</span>
          </div>
          
          <div className="details-row">
            <div className="detail-item">
              <label>City:</label>
              <span>{viewingCustomer.city}</span>
            </div>
            <div className="detail-item">
              <label>State:</label>
              <span>{viewingCustomer.state}</span>
            </div>
            <div className="detail-item">
              <label>Postal Code:</label>
              <span>{viewingCustomer.postalCode}</span>
            </div>
          </div>
        </div>
        
        <div className="details-section">
          <h3>Contact Information</h3>
          <div className="details-row">
            <div className="detail-item">
              <label>Contact Person:</label>
              <span>{viewingCustomer.contactPerson}</span>
            </div>
            <div className="detail-item">
              <label>Telephone:</label>
              <span>{viewingCustomer.telephone}</span>
            </div>
          </div>
          
          <div className="details-row">
            <div className="detail-item">
              <label>Mobile Number:</label>
              <span>{viewingCustomer.mobile}</span>
            </div>
            <div className="detail-item">
              <label>Email Address:</label>
              <span>{viewingCustomer.email}</span>
            </div>
          </div>
        </div>
        
        <div className="details-section">
          <h3>Bank Information</h3>
          <div className="details-row">
            <div className="detail-item">
              <label>Bank Account Number:</label>
              <span>{viewingCustomer.bankAccountNumber}</span>
            </div>
            <div className="detail-item">
              <label>Beneficiary Account Name:</label>
              <span>{viewingCustomer.beneficiaryAccountName}</span>
            </div>
          </div>
          
          <div className="details-row">
            <div className="detail-item">
              <label>Bank Name:</label>
              <span>{viewingCustomer.bankName}</span>
            </div>
            <div className="detail-item">
              <label>Bank Branch Name:</label>
              <span>{viewingCustomer.bankBranchName}</span>
            </div>
          </div>
          
          <div className="detail-item">
            <label>Bank Address:</label>
            <span>{viewingCustomer.bankAddress}</span>
          </div>
          
          <div className="details-row">
            <div className="detail-item">
              <label>Bank Branch State:</label>
              <span>{viewingCustomer.bankBranchState}</span>
            </div>
            <div className="detail-item">
              <label>Bank MICR Code:</label>
              <span>{viewingCustomer.bankMicrCode}</span>
            </div>
          </div>
          
          <div className="details-row">
            <div className="detail-item">
              <label>Bank RTGS/IFSC Code:</label>
              <span>{viewingCustomer.bankRtgsIfscCode}</span>
            </div>
            <div className="detail-item">
              <label>Account Type:</label>
              <span>{viewingCustomer.accountType}</span>
            </div>
            <div className="detail-item">
              <label>Currency:</label>
              <span>{viewingCustomer.currency}</span>
            </div>
          </div>
        </div>
        
        <div className="details-section">
          <h3>Tax Information</h3>
          <div className="details-row">
            <div className="detail-item">
              <label>PAN Number:</label>
              <span>{viewingCustomer.panNumber}</span>
            </div>
            <div className="detail-item">
              <label>TAN Number:</label>
              <span>{viewingCustomer.tanNumber}</span>
            </div>
          </div>
          
          <div className="details-row">
            <div className="detail-item">
              <label>GST Number:</label>
              <span>{viewingCustomer.gstNumber}</span>
            </div>
            <div className="detail-item">
              <label>GSTIN Division:</label>
              <span>{viewingCustomer.gstinDivision}</span>
            </div>
          </div>
          
          <div className="detail-item">
            <label>HSN Code:</label>
            <span>{viewingCustomer.hsnCode}</span>
          </div>
          
          <div className="details-row">
            <div className="detail-item">
              <label>Vendor Type:</label>
              <span>{viewingCustomer.vendorType}</span>
            </div>
            <div className="detail-item">
              <label>GST Not Applicable Reason:</label>
              <span>{viewingCustomer.gstNotApplicableReason}</span>
            </div>
          </div>
        </div>
        
        <div className="details-section">
          <h3>MSME Information</h3>
          <div className="details-row">
            <div className="detail-item">
              <label>MSME Vendor:</label>
              <span>{viewingCustomer.msmeVendor}</span>
            </div>
            <div className="detail-item">
              <label>MSME Certification Date:</label>
              <span>{viewingCustomer.msmeCertificationDate}</span>
            </div>
          </div>
          
          <div className="detail-item">
            <label>MSME Registration Number:</label>
            <span>{viewingCustomer.msmeRegNo}</span>
          </div>
        </div>
        
        <div className="details-section">
          <h3>Documents</h3>
          <div className="document-list">
            {files.excelFile && (
              <div className="document-item">
                <span>Excel File</span>
                <button 
                  className="btn btn-sm btn-outline"
                  onClick={() => window.open(files.excelFile.url, '_blank')}
                >
                  View
                </button>
              </div>
            )}
            {files.pdfFile && (
              <div className="document-item">
                <span>PDF File</span>
                <button 
                  className="btn btn-sm btn-outline"
                  onClick={() => window.open(files.pdfFile.url, '_blank')}
                >
                  View
                </button>
              </div>
            )}
            {files.panScan && (
              <div className="document-item">
                <span>PAN Scan</span>
                <button 
                  className="btn btn-sm btn-outline"
                  onClick={() => window.open(files.panScan.url, '_blank')}
                >
                  View
                </button>
              </div>
            )}
            {files.cancelledCheque && (
              <div className="document-item">
                <span>Cancelled Cheque</span>
                <button 
                  className="btn btn-sm btn-outline"
                  onClick={() => window.open(files.cancelledCheque.url, '_blank')}
                >
                  View
                </button>
              </div>
            )}
            {files.gstRegistration && (
              <div className="document-item">
                <span>GST Registration</span>
                <button 
                  className="btn btn-sm btn-outline"
                  onClick={() => window.open(files.gstRegistration.url, '_blank')}
                >
                  View
                </button>
              </div>
            )}
            {files.msmeCertificate && (
              <div className="document-item">
                <span>MSME Certificate</span>
                <button 
                  className="btn btn-sm btn-outline"
                  onClick={() => window.open(files.msmeCertificate.url, '_blank')}
                >
                  View
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="modal-actions">
        <button 
          type="button" 
          onClick={() => { setViewModal(false); setViewingCustomer(null); }} 
          className="btn btn-secondary"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal large-modal">
            <h2>{editingCustomer ? "Edit Vendor" : "Add New Vendor"}</h2>
            <form onSubmit={handleSave} className="vendor-form">
              <div className="form-section">
                <h3>Basic Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Vendor Name *</label>
                    <input 
                      name="vendorName" 
                      value={formData.vendorName}
                      onChange={handleInputChange}
                      placeholder="Vendor Name" 
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Country *</label>
                    <input
                      name="country" 
                      value={formData.country}
                      onChange={handleInputChange}
                      placeholder="country"
                    >
                     
                    </input>
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Address Line 1 *</label>
                  <input 
                    name="address1" 
                    value={formData.address1}
                    onChange={handleInputChange}
                    placeholder="Address Line 1" 
                   
                  />
                </div>
                
                <div className="form-group">
                  <label>Address Line 2</label>
                  <input 
                    name="address2" 
                    value={formData.address2}
                    onChange={handleInputChange}
                    placeholder="Address Line 2" 
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>City *</label>
                    <input 
                      name="city" 
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="City" 
                     
                    />
                  </div>
                  <div className="form-group">
                    <label>State *</label>
                    <input
                      name="state" 
                      value={formData.state}
                      onChange={handleInputChange}
                      placeholder="state"
                    >
                    
                    </input>
                  </div>
                  <div className="form-group">
                    <label>Postal Code *</label>
                    <input 
                      name="postalCode" 
                      value={formData.postalCode}
                      onChange={handleInputChange}
                      placeholder="Postal Code" 
                     
                    />
                  </div>
                </div>
              </div>
              
              
              <div className="form-section">
                <h3>Contact Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Contact Person *</label>
                    <input 
                      name="contactPerson" 
                      value={formData.contactPerson}
                      onChange={handleInputChange}
                      placeholder="Contact Person" 
                      
                    />
                  </div>
                  <div className="form-group">
                    <label>Telephone (with STD Code)</label>
                    <input 
                      name="telephone" 
                      value={formData.telephone}
                      onChange={handleInputChange}
                      placeholder="Telephone" 
                    />
                  </div>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Mobile Number *</label>
                    <input 
                      name="mobile" 
                      value={formData.mobile}
                      onChange={handleInputChange}
                      placeholder="Mobile Number" 
                      
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address *</label>
                    <input 
                      name="email" 
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="Email Address" 
                       
                    />
                  </div>
                </div>
              </div>
              
              <div className="form-section">
                <h3>Bank Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Bank Account Number *</label>
                    <input 
                      name="bankAccountNumber" 
                      value={formData.bankAccountNumber}
                      onChange={handleInputChange}
                      placeholder="Bank Account Number" 
                       
                    />
                  </div>
                  <div className="form-group">
                    <label>Beneficiary Account Name *</label>
                    <input 
                      name="beneficiaryAccountName" 
                      value={formData.beneficiaryAccountName}
                      onChange={handleInputChange}
                      placeholder="Beneficiary Account Name" 
                       
                    />
                  </div>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Bank Name *</label>
                    <input 
                      name="bankName" 
                      value={formData.bankName}
                      onChange={handleInputChange}
                      placeholder="Bank Name" 
                       
                    />
                  </div>
                  <div className="form-group">
                    <label>Bank Branch Name *</label>
                    <input 
                      name="bankBranchName" 
                      value={formData.bankBranchName}
                      onChange={handleInputChange}
                      placeholder="Bank Branch Name" 
                       
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Bank Address *</label>
                  <input 
                    name="bankAddress" 
                    value={formData.bankAddress}
                    onChange={handleInputChange}
                    placeholder="Bank Address" 
                    
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Bank Branch State *</label>
                    <input 
                      name="bankBranchState" 
                      value={formData.bankBranchState}
                      onChange={handleInputChange}
                      placeholder="Bank Branch State" 
                       
                    />
                  </div>
                  <div className="form-group">
                    <label>Bank MICR Code</label>
                    <input 
                      name="bankMicrCode" 
                      value={formData.bankMicrCode}
                      onChange={handleInputChange}
                      placeholder="Bank MICR Code" 
                    />
                  </div>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Bank RTGS/IFSC Code *</label>
                    <input 
                      name="bankRtgsIfscCode" 
                      value={formData.bankRtgsIfscCode}
                      onChange={handleInputChange}
                      placeholder="Bank RTGS/IFSC Code" 
                      
                    />
                  </div>
                  <div className="form-group">
                    <label>Account Type *</label>
                    <select 
                      name="accountType" 
                      value={formData.accountType}
                      onChange={handleInputChange}
                      
                    >
                      <option value="">Select Account Type</option>
                      <option value="savings">Savings</option>
                      <option value="current">Current</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Currency *</label>
                    <select 
                      name="currency" 
                      value={formData.currency}
                      onChange={handleInputChange}
                      
                    >
                      <option value="">Select Currency</option>
                      <option value="INR">Indian Rupee (INR)</option>
                      <option value="USD">US Dollar (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                      <option value="GBP">British Pound (GBP)</option>
                      <option value="AED">United Arab Emirates Dirham(AED)</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="form-section">
                <h3>Tax Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>PAN Number *</label>
                    <input 
                      name="panNumber" 
                      value={formData.panNumber}
                      onChange={handleInputChange}
                      placeholder="PAN Number" 
                      
                    />
                  </div>
                  <div className="form-group">
                    <label>TAN Number</label>
                    <input 
                      name="tanNumber" 
                      value={formData.tanNumber}
                      onChange={handleInputChange}
                      placeholder="TAN Number" 
                    />
                  </div>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>GST Number</label>
                    <input 
                      name="gstNumber" 
                      value={formData.gstNumber}
                      onChange={handleInputChange}
                      placeholder="GST Number" 
                    />
                  </div>
                  <div className="form-group">
                    <label>GSTIN Division/Ward/Circle/Sector Number</label>
                    <input 
                      name="gstinDivision" 
                      value={formData.gstinDivision}
                      onChange={handleInputChange}
                      placeholder="GSTIN Division/Ward/Circle/Sector Number" 
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label>HSN Code *</label>
                  <input 
                    name="hsnCode" 
                    value={formData.hsnCode}
                    onChange={handleInputChange}
                    placeholder="HSN Code" 
                    
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Vendor Type *</label>
                    <select 
                      name="vendorType" 
                      value={formData.vendorType}
                      onChange={handleInputChange}
                      
                    >
                      <option value="">Select Vendor Type</option>
                      <option value="manufacturer">Manufacturer</option>
                      <option value="trader">Trader</option>
                      <option value="consultant">Consultant</option>
                      <option value="serviceProvider">Service Provider</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>If GSTIN not applicable, reason for the same</label>
                    <input 
                      name="gstNotApplicableReason" 
                      value={formData.gstNotApplicableReason}
                      onChange={handleInputChange}
                      placeholder="Reason for GSTIN not applicable" 
                    />
                  </div>
                </div>
              </div>
              
              <div className="form-section">
                <h3>MSME Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>MSME Vendor (small/micro, excluding trader)</label>
                    <select 
                      name="msmeVendor" 
                      value={formData.msmeVendor}
                      onChange={handleInputChange}
                    >
                      <option value="">Select MSME Status</option>
                      <option value="small">Small</option>
                      <option value="micro">Micro</option>
                      <option value="notApplicable">Not Applicable</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>MSME Certification Date</label>
                    <input 
                      name="msmeCertificationDate" 
                      type="date"
                      value={formData.msmeCertificationDate}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label>MSME Registration Number</label>
                  <input 
                    name="msmeRegNo" 
                    value={formData.msmeRegNo}
                    onChange={handleInputChange}
                    placeholder="MSME Registration Number" 
                  />
                </div>
              </div>
              
              <div className="form-section">
                <h3>Declaration</h3>
                <div className="form-group declaration-checkbox">
                  <label>
                    <input 
                      name="declaration" 
                      type="checkbox"
                      checked={formData.declaration}
                      onChange={handleInputChange}
                      
                    />
                    We hereby certify that above mentioned details are correct. We further confirm that the said details can be used by Seal Freight Forwarders Pvt. Ltd. for online remittance of funds. The responsibility of any delay in payment and additional processing charges due to incorrect details vest with us.
                  </label>
                </div>
                
                <div className="notes">
                  <p><strong>Note:</strong></p>
                  <ol>
                    <li>Please provide Soft Copy (Excel & PDF (With Sign and seal) Both format).</li>
                    <li>Please provide PAN Scan PDF Copy.</li>
                    <li>Cancelled Cheque PDF Copy.</li>
                    <li>GST Registration PDF Copy.</li>
                    <li>SSI/ MSMED Certificate PDF Copy if applicable.</li>
                  </ol>
                </div>
              </div>
              
              
        <div className="form-section">
                <h3>Required Documents</h3>
                
                <FileUploadField 
                  label="Soft Copy (Excel Format)" 
                  fileType="excelFile" 
                />
                
                <FileUploadField 
                  label="Soft Copy (PDF Format with Sign and Seal)" 
                  fileType="pdfFile" 
                />
                
                <FileUploadField 
                  label="PAN Scan PDF Copy" 
                  fileType="panScan" 
                />
                
                <FileUploadField 
                  label="Cancelled Cheque PDF Copy" 
                  fileType="cancelledCheque" 
                />
                
                <FileUploadField 
                  label="GST Registration PDF Copy" 
                  fileType="gstRegistration" 
                />
                
                <FileUploadField 
                  label="SSI/MSMED Certificate PDF Copy (if applicable)" 
                  fileType="msmeCertificate" 
                />
              </div>
              
              <div className="modal-actions">
                <button 
                  type="button" 
                  onClick={() => { setShowModal(false); setEditingCustomer(null); }} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={uploading}
                >
                  {editingCustomer ? "Update Vendor" : "Save Vendor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      <style jsx>{`
        .customer-management {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: Arial, sans-serif;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h1 {
  color: #2c3e50; /* Dark blue-gray for good contrast */
  font-size: 28px;
  font-weight: 600;
  margin: 0;
}

.search-bar {
  margin-bottom: 20px;
}

.search-bar input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.customers-table-container {
  overflow-x: auto;
}

.customers-table {
  width: 100%;
  border-collapse: collapse;
  background-color: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.customers-table th,
.customers-table td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.customers-table th {
  background-color: #f8f9fa;
  color: #2c3e50; /* Dark text for contrast */
  font-weight: 600;
}

.customers-table tr:hover {
  background-color: #f5f5f5;
}

.no-data {
  text-align: center;
  padding: 20px;
  color: #6c757d;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  margin-right: 8px;
  transition: background-color 0.2s;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover {
  background-color: #0069d9;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background-color: #5a6268;
}

.btn-outline {
  background-color: transparent;
  border: 1px solid #007bff;
  color: #007bff;
}

.btn-outline:hover {
  background-color: #007bff;
  color: white;
}

.btn-danger {
  background-color: #dc3545;
  color: white;
}

.btn-danger:hover {
  background-color: #c82333;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background-color: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

.large-modal {
  max-width: 800px;
}

.modal h2 {
  color: #2c3e50;
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 24px;
}

.vendor-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  background-color: #f8f9fa;
}

.form-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: #007bff;
  font-size: 18px;
  font-weight: 600;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-row .form-group {
  flex: 1;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #495057;
}

.form-group input, .form-group select, .form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-group input:focus, .form-group select:focus, .form-group textarea:focus {
  border-color: #007bff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(0,123,255,0.25);
}

.declaration-checkbox label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-weight: normal;
  color: #495057;
}

.declaration-checkbox input[type="checkbox"] {
  width: auto;
  margin-top: 4px;
}

.notes {
  background-color: #e8f4ff;
  border-left: 4px solid #007bff;
  padding: 12px 16px;
  margin-top: 16px;
  border-radius: 4px;
}

.notes p {
  margin: 0 0 8px 0;
  color: #2c3e50;
  font-weight: 500;
}

.notes ol {
  margin: 0;
  padding-left: 20px;
  color: #495057;
}

.notes li {
  margin-bottom: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.loading, .error {
  text-align: center;
  padding: 40px;
  font-size: 18px;
}

.loading {
  color: #6c757d;
}

.error {
  color: #dc3545;
}

@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
    gap: 0;
  }
  
  .large-modal {
    max-width: 95%;
  }
  
  .page-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .modal {
    padding: 16px;
  }
}
   .vendor-details {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  
  .details-section {
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 16px;
    background-color: #f8f9fa;
  }
  
  .details-section h3 {
    margin-top: 0;
    margin-bottom: 16px;
    color: #007bff;
    font-size: 18px;
    font-weight: 600;
  }
  
  .details-row {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
  }
  
  .detail-item {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  
  .detail-item label {
    font-weight: 600;
    color: #495057;
    margin-bottom: 4px;
  }
  
  .detail-item span {
    padding: 8px;
    background-color: white;
    border-radius: 4px;
    border: 1px solid #e9ecef;
    min-height: 38px;
  }
  
  .document-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .document-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background-color: white;
    border-radius: 4px;
    border: 1px solid #e9ecef;
  }
      `}</style>
    </div>
  );
};

export default CustomerPage;